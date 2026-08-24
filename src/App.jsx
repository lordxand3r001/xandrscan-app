import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppKit, useAppKitAccount } from '@reown/appkit/react'
import { useSignMessage } from 'wagmi'

// ─── CONFIG ──────────────────────────────────────────────────────────
const WORKER = 'https://xandrscan-api.noreply-xandrscan.workers.dev'

const TIERS = {
  free:    { label:'FREE',    color:'#64748b', scans:10  },
  starter: { label:'STARTER', color:'#00C2FF', scans:50  },
  pro:     { label:'PRO',     color:'#A855F7', scans:200 },
  alpha:   { label:'ALPHA',   color:'#F59E0B', scans:999999 },
  owner:   { label:'OWNER',   color:'#F59E0B', scans:999999 },
}

const CHAINS = [
  { id:'ethereum', label:'Ethereum' },
  { id:'base',     label:'Base'     },
  { id:'bsc',      label:'BSC'      },
  { id:'solana',   label:'Solana'   },
]

const EXPLORER_URL = {
  ethereum: 'https://etherscan.io/address/',
  base:     'https://basescan.org/address/',
  bsc:      'https://bscscan.com/address/',
  solana:   'https://solscan.io/account/',
}

const C = {
  bg:'#0A0B12', surface:'#131A2B', surfaceB:'#161D30',
  border:'rgba(0,194,255,0.18)',
  blue:'#00D9FF', purple:'#B966FF', gold:'#FFB020',
  text:'#FFFFFF', textM:'#A8B5CC', textD:'#5A6B85',
  danger:'#FF4560', success:'#00FFB2',
  grad:'linear-gradient(135deg,#00D9FF,#B966FF)',
  gradFull:'linear-gradient(135deg,#00D9FF 0%,#B966FF 55%,#FFB020 100%)',
}

const getRisk = s => {
  if (s <= 35) return { color:C.success, label:'LOW RISK',      bg:'rgba(0,229,160,0.07)',  glow:'rgba(0,229,160,0.2)'  }
  if (s <= 65) return { color:C.gold,    label:'MODERATE RISK', bg:'rgba(245,158,11,0.07)', glow:'rgba(245,158,11,0.2)' }
  return             { color:C.danger,   label:'HIGH RISK',     bg:'rgba(255,69,96,0.07)',  glow:'rgba(255,69,96,0.2)'  }
}

const fmt    = n => Number(n||0).toLocaleString()
const shortW = w => w ? `${w.slice(0,6)}...${w.slice(-4)}` : ''
const isRealValue = v => !!v && !['unknown','???','n/a','null','undefined',''].includes(String(v).trim().toLowerCase())
const LS     = {
  get:  k    => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):null } catch { return null } },
  set:  (k,v)=> { try { localStorage.setItem(k,JSON.stringify(v)) } catch {} },
  del:  k    => { try { localStorage.removeItem(k) } catch {} },
}

// ─── APP-LOCK HELPERS ───────────────────────────────────────────────
// Local-only re-entry gate on top of an already-valid session — never sent
// to the backend, never tied to the account. See PIN/WebAuthn setup below.
const sha256Hex = async str => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
const b64uEncode = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64uDecode = str => {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const bin = atob(str)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}
const isDeviceLockAvailable = async () => {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) }
  catch { return false }
}

// ─── NETWORK HELPERS ────────────────────────────────────────────────
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), ms)),
  ])

const isRelayError = (msg='') =>
  msg.includes('Failed to publish payload') ||
  msg.includes('Failed to fetch') ||
  msg.includes('NetworkError') ||
  msg.includes('RPC error') ||
  msg.includes('relay') ||
  msg.includes('timed out')

const RELAY_MESSAGE = 'Connection unstable — this is common on some mobile networks. Try switching to WiFi, using a VPN, or retry in a moment.'

const withRetry = async (fn, retries = 2, delayMs = 1500) => {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isRelayError(e.message || '') || attempt === retries) throw lastErr
      await new Promise(res => setTimeout(res, delayMs))
    }
  }
  throw lastErr
}

const api = async (path, body, { retries = 2, delayMs = 1500, timeoutMs = 20000 } = {}) => {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await withTimeout(
        fetch(`${WORKER}${path}`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
        }),
        timeoutMs, 'Request'
      )
      return await r.json()
    } catch (e) {
      lastErr = e
      if (!isRelayError(e.message || '') || attempt === retries) {
        return { error: 'NETWORK_ERROR', message: e.message || RELAY_MESSAGE }
      }
      await new Promise(res => setTimeout(res, delayMs))
    }
  }
  return { error: 'NETWORK_ERROR', message: lastErr?.message || RELAY_MESSAGE }
}

// ─── LOGO ─────────────────────────────────────────────────────────────
function Logo({ size=40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <defs>
        <linearGradient id="lgM" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#C0EEFF"/>
          <stop offset="18%"  stopColor="#3DD4FF"/>
          <stop offset="45%"  stopColor="#0099EE"/>
          <stop offset="78%"  stopColor="#0055AA"/>
          <stop offset="100%" stopColor="#002060"/>
        </linearGradient>
        <linearGradient id="lgS" x1="0%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%"   stopColor="#D8F5FF"/>
          <stop offset="20%"  stopColor="#55DDFF"/>
          <stop offset="48%"  stopColor="#00AAFF"/>
          <stop offset="80%"  stopColor="#0066BB"/>
          <stop offset="100%" stopColor="#002877"/>
        </linearGradient>
      </defs>
      {/* Two sharp crossed blades forming the X */}
      <polygon points="8,8 92.9,107.1 192,192 107.1,92.9"   fill="url(#lgM)" stroke="#001845" strokeWidth="1.5"/>
      <polygon points="192,8 107.1,107.1 8,192 92.9,92.9"   fill="url(#lgM)" stroke="#001845" strokeWidth="1.5"/>
      {/* Bold S swoosh, square-cut ends for a forged-not-soft look */}
      {/* Clearance knockout so the blade behind can't intrude into the S's silhouette */}
      <path d="M 150,32 C 150,32 74,26 54,66 C 34,106 106,118 124,140 C 142,162 134,184 58,190" stroke="#0A0B12" strokeWidth="46" strokeLinecap="square" fill="none"/>
      <path d="M 150,32 C 150,32 74,26 54,66 C 34,106 106,118 124,140 C 142,162 134,184 58,190" stroke="url(#lgS)" strokeWidth="34" strokeLinecap="square" fill="none"/>
      {/* Specular highlight streak for the glossy metal read */}
      <g transform="translate(-4,-4)">
        <path d="M 150,32 C 150,32 74,26 54,66 C 34,106 106,118 124,140 C 142,162 134,184 58,190" stroke="#EAFBFF" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.55"/>
      </g>
    </svg>
  )
}

// ─── MAIN APP ─────────────────────────────────────────────────────────
export default function App() {
  const { open }                 = useAppKit()
  const { address, isConnected } = useAppKitAccount()
  const { signMessageAsync }     = useSignMessage()

  // Auth state
  const [sessionToken, setSessionToken] = useState(() => LS.get('xs_session'))
  // Saved alongside sessionToken at sign-in time. Using this (instead of the
  // live `address` from useAppKitAccount) for all authenticated API calls
  // means the app works from a saved session even before — or without —
  // WalletConnect's relay reconnect finishing on this page load.
  const [savedWallet, setSavedWallet] = useState(() => LS.get('xs_wallet'))
  const wallet = savedWallet || address

  // App-lock state — opt-in, local-only re-entry gate on top of the session.
  const [lockMethod, setLockMethod] = useState(() => LS.get('xs_lock_method') || 'none')
  const [unlocked, setUnlocked] = useState(() => {
    const method = LS.get('xs_lock_method') || 'none'
    return !(LS.get('xs_session') && method !== 'none')
  })
  const [deviceLockAvailable, setDeviceLockAvailable] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinSetupStage, setPinSetupStage] = useState('create') // 'create' | 'confirm'
  const [pinFirstEntry, setPinFirstEntry] = useState('')
  const [lockErr, setLockErr] = useState('')

  useEffect(() => { isDeviceLockAvailable().then(setDeviceLockAvailable) }, [])

  // Offer the lock setup once, only after a real session exists and only if
  // the user hasn't already set one up or dismissed the offer before.
  useEffect(() => {
    if (sessionToken && unlocked && lockMethod === 'none' && LS.get('xs_lock_prompted') !== 1 && !modal) {
      setModal('lock-setup')
    }
  }, [sessionToken, unlocked, lockMethod])

  const setupWebAuthnLock = async () => {
    setLockErr('')
    try {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'XANDRSCAN' },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'xandrscan-user', displayName: 'XANDRSCAN' },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 60000,
        }
      })
      LS.set('xs_lock_method', 'webauthn')
      LS.set('xs_webauthn_id', b64uEncode(cred.rawId))
      LS.set('xs_lock_prompted', 1)
      setLockMethod('webauthn')
      setModal(null)
    } catch {
      setLockErr('Could not set up device lock on this browser. Try a PIN instead, or skip.')
    }
  }

  const setupPinLock = async pin => {
    if (pinSetupStage === 'create') {
      setPinFirstEntry(pin); setPinInput(''); setPinSetupStage('confirm'); return
    }
    if (pin !== pinFirstEntry) {
      setLockErr("PINs didn't match — try again."); setPinInput(''); setPinFirstEntry(''); setPinSetupStage('create'); return
    }
    LS.set('xs_lock_method', 'pin')
    LS.set('xs_pin_hash', await sha256Hex(pin))
    LS.set('xs_lock_prompted', 1)
    setLockMethod('pin')
    setModal(null)
    setPinInput(''); setPinFirstEntry(''); setPinSetupStage('create'); setLockErr('')
  }

  const skipLockSetup = () => { LS.set('xs_lock_prompted', 1); setModal(null) }

  const unlockWithWebAuthn = async () => {
    setLockErr('')
    try {
      const credId = LS.get('xs_webauthn_id')
      await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: credId ? [{ id: b64uDecode(credId), type: 'public-key' }] : [],
          userVerification: 'required',
          timeout: 60000,
        }
      })
      setUnlocked(true)
    } catch {
      setLockErr('Unlock failed or was cancelled. Try again.')
    }
  }

  const unlockWithPin = async () => {
    const hash = await sha256Hex(pinInput)
    if (hash === LS.get('xs_pin_hash')) { setUnlocked(true); setPinInput(''); setLockErr('') }
    else { setLockErr('Wrong PIN. Try again.'); setPinInput('') }
  }

  // Backfills xs_wallet for sessions that were created before this key existed
  // (i.e. signed in before the session/wallet-persistence fix shipped) — without
  // this, a perfectly valid session silently has no wallet attached to it.
  useEffect(() => {
    if (!sessionToken || savedWallet) return
    api('/resolve-session', { sessionToken }).then(data => {
      if (data.wallet) {
        LS.set('xs_wallet', data.wallet)
        setSavedWallet(data.wallet)
      } else {
        // Session itself is gone server-side — clear it so the sign-in screen shows.
        LS.del('xs_session'); setSessionToken(null)
      }
    }).catch(() => {})
  }, [sessionToken, savedWallet])
  const [signing, setSigning]           = useState(false)
  const [authErr, setAuthErr]           = useState('')

  // User state
  const [user, setUser]     = useState(null)
  const [usage, setUsage]   = useState(null)

  // Scanner state
  const [addr, setAddr]     = useState('')
  const [chain, setChain]   = useState('ethereum')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [dex, setDex]       = useState(null)
  const [err, setErr]       = useState(null)
  const [copied, setCopied] = useState(false)
  const [copiedAddr, setCopiedAddr] = useState(null)

  // Approval/phishing checker state — separate from the token scanner's
  // addr/chain/report/loading/err above, deliberately not shared, since
  // running one shouldn't clobber a result sitting in the other tab
  const [checkQuery, setCheckQuery]     = useState('')
  const [checkChain, setCheckChain]     = useState('ethereum')
  const [checkLoading, setCheckLoading] = useState(false)
  const [checkResult, setCheckResult]   = useState(null)
  const [checkErr, setCheckErr]         = useState(null)

  // UI state
  const [view, setView]     = useState('scan') // scan | history | watchlist
  const [modal, setModal]   = useState(null)
  const [selTier, setSelTier] = useState(null)
  const [txHash, setTxHash] = useState('')
  const [vfying, setVfying] = useState(false)
  const [vfMsg, setVfMsg]   = useState({ text:'', ok:false })
  const [codeIn, setCodeIn] = useState('')
  const [codeMsg, setCodeMsg] = useState({ text:'', ok:false })

  // History/watchlist
  const [history, setHistory]   = useState([])
  const [watchlist, setWatchlist] = useState([])
  const [histPage, setHistPage] = useState(1)
  const [tgLink, setTgLink]     = useState(null)
  const [tgLoading, setTgLoading] = useState(false)

  // ── AUTH FLOW ──────────────────────────────────────────────────────
  const signIn = useCallback(async () => {
    if (!address) return
    setSigning(true); setAuthErr('')
    let stage = 'Connecting to XANDRSCAN'
    try {
      stage = 'Connecting to XANDRSCAN'
      const { nonce, message } = await withTimeout(api('/auth-nonce', { wallet: address }), 15000, 'Nonce request')
      if (!nonce) throw new Error('Failed to get nonce')

      stage = 'Waiting on your wallet app'
      const signature = await withRetry(() =>
        // 3 attempts (default retries=2) × 50s + 2 retry delays ≈ 153s (~2.6min) worst case
        withTimeout(signMessageAsync({ message }), 50000, 'Wallet signature')
      )

      stage = 'Verifying your signature'
      const result = await withTimeout(api('/auth-verify', { wallet: address, signature, nonce, chain: 'ethereum' }), 15000, 'Verification')
      if (result.sessionToken) {
        LS.set('xs_session', result.sessionToken)
        setSessionToken(result.sessionToken)
        LS.set('xs_wallet', address)
        setSavedWallet(address)
      } else {
        throw new Error(result.error || 'Verification failed')
      }
    } catch (e) {
      const msg = e.message || ''
      const base = isRelayError(msg) ? RELAY_MESSAGE : (msg || 'Signing failed. Please try again.')
      setAuthErr(`[${stage}] ${base}`)
    }
    setSigning(false)
  }, [address, signMessageAsync])

  // Reset auth state when wallet disconnects (sign-in is now manually triggered
  // via the "SIGN TO VERIFY WALLET" button below, not auto-fired, to avoid
  // re-triggering the MetaMask deep link on every page reload)
  //
  // isConnected starts false on every page load, before Reown AppKit finishes
  // silently reconnecting the wallet — without this guard, that transient
  // false wipes the saved session before reconnect even gets a chance to
  // complete, forcing a fresh wallet sign-in on every visit. wasConnected
  // only lets this fire on a *real* connected -> disconnected transition.
  const wasConnected = useRef(false)
  useEffect(() => {
    if (isConnected) {
      wasConnected.current = true
      return
    }
    if (wasConnected.current) {
      wasConnected.current = false
      LS.del('xs_session')
      LS.del('xs_wallet')
      setSessionToken(null)
      setSavedWallet(null)
      setUser(null)
      setUsage(null)
      setReport(null)
    }
  }, [isConnected])

  // Load user + usage when session exists
  useEffect(() => {
    if (!wallet || !sessionToken) return
    api('/get-user', { wallet }).then(data => {
      if (data.wallet_address) setUser(data)
    })
    api('/usage', { wallet, sessionToken }).then(data => {
      if (data.tier) setUsage(data)
    })
  }, [wallet, sessionToken])

  const refreshUsage = async () => {
    if (!wallet || !sessionToken) return
    const data = await api('/usage', { wallet, sessionToken })
    if (data.tier) setUsage(data)
  }

  // ── SCAN ──────────────────────────────────────────────────────────
  const analyze = async () => {
    if (!addr.trim() || !sessionToken) return
    if (usage && usage.remaining <= 0 && user?.tier !== 'owner') { setModal('paywall'); return }
    setLoading(true); setErr(null); setReport(null); setDex(null)
    try {
      // /scan is a heavier multi-stage endpoint (GoPlus incl. its own rate-limit
      // retries, DexScreener, AI cascade, deployer/funder tracing) than the other
      // calls this helper serves — the 20s/2-retry default is tuned for lighter
      // calls like /usage. A real backend timeout here isn't a flaky-relay issue
      // that a same-shape retry would fix; retrying the full AI cascade again is
      // unlikely to land faster and just multiplies AI cost for the same outcome,
      // so only one retry, with more time to actually finish.
      const data = await api('/scan', { wallet, sessionToken, address: addr.trim(), chain }, { timeoutMs: 30000, retries: 1 })
      if (data.error === 'NETWORK_ERROR') {
        setErr(data.message || RELAY_MESSAGE)
        setLoading(false); return
      }
      if (data.error === 'SCAN_LIMIT_REACHED') { setModal('paywall'); setLoading(false); return }
      if (data.error === 'WALLET_UNVERIFIED') {
        setErr(`Wallet not eligible: ${data.message}`)
        setLoading(false); return
      }
      if (data.error === 'AUTH_REQUIRED') {
        setSessionToken(null); LS.del('xs_session')
        setSavedWallet(null); LS.del('xs_wallet')
        setErr('Session expired. Please sign in again.')
        setLoading(false); return
      }
      if (data.error === 'AI_UNAVAILABLE' || data.error === 'AI_PARSE_ERROR') {
        setErr(data.message || 'Analysis engines are busy right now. Please try again in a moment.')
        setLoading(false); return
      }
      if (data.error) { setErr(data.error); setLoading(false); return }
      setReport(data)
      setDex(data._raw?.dex || null)
      await refreshUsage()
    } catch (e) {
      const msg = e.message || ''
      setErr(isRelayError(msg) ? RELAY_MESSAGE : 'Analysis failed. Check the address and try again.')
    }
    setLoading(false)
  }

  const runCheck = async () => {
    const q = checkQuery.trim()
    if (!q) return
    setCheckLoading(true); setCheckErr(null); setCheckResult(null)
    try {
      // No wallet/session required — /api/check-approval is free/no-auth,
      // unlike /scan above. IP-rate-limited server-side instead.
      const data = await api('/api/check-approval', { query: q, chain: checkChain }, { timeoutMs: 20000, retries: 1 })
      if (data.error === 'NETWORK_ERROR') {
        setCheckErr(data.message || RELAY_MESSAGE)
        setCheckLoading(false); return
      }
      if (data.error === 'RATE_LIMITED') {
        setCheckErr(data.message || 'Too many checks — wait a minute and try again.')
        setCheckLoading(false); return
      }
      if (data.error === 'PROVIDER_RATE_LIMITED') {
        setCheckErr(data.message || 'The safety-check provider is currently rate-limited — try again shortly.')
        setCheckLoading(false); return
      }
      if (data.error === 'UNRECOGNIZED_INPUT') {
        setCheckErr(data.message || 'Enter a URL or a wallet address (0x...).')
        setCheckLoading(false); return
      }
      if (data.error) { setCheckErr(data.message || data.error); setCheckLoading(false); return }
      setCheckResult(data)
    } catch (e) {
      const msg = e.message || ''
      setCheckErr(isRelayError(msg) ? RELAY_MESSAGE : 'Check failed. Try again.')
    }
    setCheckLoading(false)
  }

  // ── WATCHLIST ─────────────────────────────────────────────────────
  const addToWatchlist = async () => {
    if (!report || !sessionToken) return
    const result = await api('/watchlist/add', {
      wallet, sessionToken,
      address: addr.trim(), chain,
      tokenName: report.tokenName, symbol: report.symbol,
      riskScore: report.riskScore,
      liquidity: report._raw?.dex?.liquidity,
      marketCap: report._raw?.dex?.marketCap,
    })
    if (result.success) alert('Added to watchlist!')
    else alert(result.error || 'Failed to add')
  }

  const loadWatchlist = async () => {
    if (!sessionToken) return
    const data = await api('/watchlist/list', { wallet, sessionToken })
    if (data.watchlist) setWatchlist(data.watchlist)
  }

  const removeFromWatchlist = async (tokenAddress, tokenChain) => {
    await api('/watchlist/remove', { wallet, sessionToken, address: tokenAddress, chain: tokenChain })
    loadWatchlist()
  }

  const generateTelegramLink = async () => {
    setTgLoading(true)
    const result = await api('/telegram/link-code', { wallet, sessionToken })
    if (result.deepLink) setTgLink(result)
    setTgLoading(false)
  }

  // ── HISTORY ───────────────────────────────────────────────────────
  const loadHistory = async (page = 1) => {
    if (!sessionToken) return
    const data = await api('/scan-history', { wallet, sessionToken, page, limit: 20 })
    if (data.history) { setHistory(data.history); setHistPage(page) }
  }

  useEffect(() => {
    if (view === 'history' && sessionToken) loadHistory()
    if (view === 'watchlist' && sessionToken) loadWatchlist()
  }, [view, sessionToken])

  // ── PAYMENT ───────────────────────────────────────────────────────
  const verifyPayment = async () => {
    if (!txHash.trim() || !selTier || !sessionToken) return
    setVfying(true); setVfMsg({ text:'', ok:false })
    const data = await api('/verify-payment', { wallet, sessionToken, txHash: txHash.trim(), tier: selTier })
    if (data.success) {
      setVfMsg({ text:`✅ ${selTier.toUpperCase()} unlocked!`, ok:true })
      await refreshUsage()
      setTimeout(() => { setModal(null); setVfMsg({ text:'', ok:false }); setTxHash('') }, 3000)
    } else {
      const msgs = {
        TX_ALREADY_USED:'❌ Transaction already used.',
        TX_NOT_FOUND:'❌ TX not found.',
        TX_PENDING:'⏳ Still pending. Try again shortly.',
        WRONG_WALLET:'❌ Payment sent to wrong wallet.',
        WALLET_MISMATCH:'❌ Payment must come from your connected wallet.',
        UNDERPAID:`❌ Underpaid. Check the amount.`,
        AUTH_REQUIRED:'❌ Session expired. Please reconnect.',
      }
      setVfMsg({ text: msgs[data.error] || '❌ Verification failed.', ok:false })
    }
    setVfying(false)
  }

  const redeemCode = async () => {
    if (!sessionToken) return
    const data = await api('/use-code', { wallet, sessionToken, code: codeIn.trim() })
    if (data.success) {
      setCodeMsg({ text:'👑 OWNER MODE UNLOCKED.', ok:true })
      await refreshUsage()
      setTimeout(() => { setModal(null); setCodeMsg({ text:'', ok:false }); setCodeIn('') }, 2200)
    } else {
      setCodeMsg({ text: data.error === 'INVALID_CODE' ? 'Invalid code.' : 'Error. Try again.', ok:false })
    }
  }

  const shareReport = () => {
    if (!report) return
    const rsk = getRisk(report.riskScore)
    const txt = `🔍 XANDRSCAN REPORT\n━━━━━━━━━━━━━━━━━━\nToken: ${report.tokenName} (${report.symbol})\nChain: ${chain.toUpperCase()}\nRisk Score: ${report.riskScore}/100 — ${rsk.label}\n\n"${report.verdict}"\n\n🚩 Red Flags:\n${(report.redFlags||[]).map(f=>`• ${f}`).join('\n')}\n\n✅ Green Lights:\n${(report.greenLights||[]).map(g=>`• ${g}`).join('\n')}\n\n⚡ ${report.actionableAdvice}\n\nScanned by XANDRSCAN · xandrscan.vercel.app\nNot financial advice.`
    navigator.clipboard.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500) })
  }

  const copyAddr = useCallback((address) => {
    navigator.clipboard.writeText(address).then(() => {
      setCopiedAddr(address)
      setTimeout(() => setCopiedAddr(prev => prev === address ? null : prev), 2500)
    })
  }, [])

  const risk = report ? getRisk(report.riskScore) : null
  const cur  = TIERS[user?.tier] || TIERS.free

  // ── SPLASH ────────────────────────────────────────────────────────
  if (!sessionToken) return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:"'Courier New',Monaco,monospace", display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', textAlign:'center' }}>
      <style>{`
        @keyframes xs-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes xs-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ position:'relative', marginBottom:8 }}>
        <div style={{ position:'absolute', inset:-20, borderRadius:'50%', background:'conic-gradient(from 0deg, rgba(0,217,255,0.25), rgba(185,102,255,0.25), rgba(255,176,32,0.25), rgba(0,217,255,0.25))', filter:'blur(14px)', animation:'xs-spin 6s linear infinite' }}/>
        <div style={{ position:'absolute', inset:-20, borderRadius:'50%', background:'radial-gradient(circle,rgba(0,217,255,0.18) 0%,transparent 65%)', filter:'blur(10px)', animation:'xs-pulse 2.4s ease-in-out infinite' }}/>
        <div style={{ position:'relative', filter:'drop-shadow(0 0 20px rgba(0,217,255,0.55))' }}><Logo size={96}/></div>
      </div>
      <div style={{ fontSize:26, fontWeight:'bold', letterSpacing:7, marginTop:18, background:C.gradFull, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>XANDRSCAN</div>
      <div style={{ fontSize:10, color:C.textM, letterSpacing:4, marginTop:6 }}>AI TOKEN RISK INTELLIGENCE</div>
      <div style={{ width:60, height:1, background:C.grad, margin:'20px auto' }}/>
      <div style={{ maxWidth:280, fontSize:13, color:C.textM, lineHeight:2, marginBottom:32 }}>
        Scan any token. Detect rug patterns.<br/>
        <span style={{ color:C.text }}>Know the risk before you trade.</span>
      </div>

      {!isConnected ? (
        <button onClick={() => open()} style={{ width:'100%', maxWidth:320, padding:'15px', borderRadius:10, background:C.grad, color:'#fff', border:'none', cursor:'pointer', fontSize:12, fontWeight:'bold', letterSpacing:2, boxShadow:'0 0 28px rgba(0,217,255,0.3)', fontFamily:'inherit' }}>
          🔗  CONNECT WALLET
        </button>
      ) : signing ? (
        <div style={{ width:'100%', maxWidth:320 }}>
          <div style={{ fontSize:13, color:C.textM, marginBottom:14 }}>⟳ Signing message to verify wallet...</div>
          <button onClick={() => setSigning(false)} style={{ width:'100%', padding:'11px', borderRadius:9, background:'transparent', color:C.textM, border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>
            CANCEL
          </button>
        </div>
      ) : (
        <div style={{ width:'100%', maxWidth:320 }}>
          <button onClick={signIn} style={{ width:'100%', padding:'15px', borderRadius:10, background:C.grad, color:'#fff', border:'none', cursor:'pointer', fontSize:12, fontWeight:'bold', letterSpacing:2, fontFamily:'inherit', marginBottom:10 }}>
            ✍️  SIGN TO VERIFY WALLET
          </button>
          {authErr && <div style={{ fontSize:12, color:C.danger, lineHeight:1.7 }}>{authErr}</div>}
        </div>
      )}

      <div style={{ marginTop:24, maxWidth:300, fontSize:9, color:C.textD, letterSpacing:1, lineHeight:1.8 }}>
        Not financial advice · Scans are probabilistic · DYOR
      </div>
    </div>
  )

  // ── LOCK SCREEN ──────────────────────────────────────────────────
  if (sessionToken && !unlocked) return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:"'Courier New',Monaco,monospace", display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', textAlign:'center' }}>
      <style>{`
        @keyframes xs-pulse { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.15);opacity:1} }
        @keyframes xs-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes xs-rise { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .xs-lock-in { animation: xs-rise .6s cubic-bezier(.16,1,.3,1) both; }
        .xs-lock-btn:active { transform:scale(0.97); }
      `}</style>
      <div className="xs-lock-in" style={{ display:'flex', flexDirection:'column', alignItems:'center', width:'100%' }}>
        <div style={{ position:'relative', marginBottom:8 }}>
          <div style={{ position:'absolute', inset:-20, borderRadius:'50%', background:'conic-gradient(from 0deg, rgba(0,217,255,0.25), rgba(185,102,255,0.25), rgba(255,176,32,0.25), rgba(0,217,255,0.25))', filter:'blur(14px)', animation:'xs-spin 6s linear infinite' }}/>
          <div style={{ position:'absolute', inset:-20, borderRadius:'50%', background:'radial-gradient(circle,rgba(0,217,255,0.18) 0%,transparent 65%)', filter:'blur(10px)', animation:'xs-pulse 2.4s ease-in-out infinite' }}/>
          <div style={{ position:'relative', filter:'drop-shadow(0 0 20px rgba(0,217,255,0.55))' }}><Logo size={72}/></div>
        </div>
        <div style={{ fontSize:22, fontWeight:'bold', letterSpacing:6, marginTop:16, background:C.gradFull, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>XANDRSCAN</div>
        <div style={{ fontSize:9, padding:'4px 12px', border:`1px solid ${C.blue}28`, borderRadius:20, color:C.blue, background:`${C.blue}0d`, letterSpacing:2, marginTop:12, marginBottom:26 }}>
          🔒 SESSION LOCKED
        </div>
        {lockErr && <div style={{ fontSize:12, color:C.danger, marginBottom:14, maxWidth:280 }}>{lockErr}</div>}
        <div style={{ width:'100%', maxWidth:280 }}>
          {lockMethod === 'webauthn' ? (
            <PBtn onClick={unlockWithWebAuthn} className="xs-lock-btn">🔒 UNLOCK</PBtn>
          ) : (
            <>
              <AI type="password" inputMode="numeric" maxLength={6} value={pinInput}
                  onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter PIN" style={{ textAlign:'center', letterSpacing:8 }}/>
              <PBtn disabled={pinInput.length < 4} onClick={unlockWithPin} className="xs-lock-btn">UNLOCK</PBtn>
            </>
          )}
        </div>
      </div>
    </div>
  )

  // ── MAIN APP ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:"'Courier New',Monaco,monospace" }}>

      {/* MODALS */}
      {modal === 'lock-setup' && (
        <Overlay>
          <MT>Lock This App?</MT>
          <MS>
            {pinSetupStage === 'confirm'
              ? 'Confirm your PIN.'
              : 'Add a quick unlock step so your saved session can\'t be opened by anyone who picks up your phone. Fully optional — skip anytime.'}
          </MS>
          {lockErr && <div style={{ fontSize:12, color:C.danger, marginBottom:10, textAlign:'center' }}>{lockErr}</div>}
          {deviceLockAvailable && (
            <PBtn onClick={setupWebAuthnLock}>🔒 USE DEVICE LOCK</PBtn>
          )}
          <AI type="password" inputMode="numeric" maxLength={6} value={pinInput}
              onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder={pinSetupStage === 'confirm' ? 'Confirm PIN' : '4–6 digit PIN'}
              style={{ textAlign:'center', letterSpacing:8, marginTop:10 }}/>
          <PBtn disabled={pinInput.length < 4} onClick={() => setupPinLock(pinInput)}>
            {pinSetupStage === 'confirm' ? 'CONFIRM PIN' : 'SET PIN INSTEAD'}
          </PBtn>
          <GBtn onClick={skipLockSetup}>Skip for now</GBtn>
        </Overlay>
      )}

      {modal === 'share' && report && (
        <div style={{ position:'fixed', inset:0, background:C.bg, zIndex:100, overflowY:'auto', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize:10, color:C.textM, letterSpacing:2 }}>SHARE CARD</div>
            <button onClick={() => setModal(null)} style={{ background:'none', border:'none', color:C.textM, fontSize:20, cursor:'pointer', lineHeight:1 }}>✕</button>
          </div>

          <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'32px 20px' }}>
            <div style={{ background:C.surface, border:`1px solid ${risk.color}44`, borderRadius:20, padding:'28px 22px', boxShadow:`0 0 40px ${risk.glow}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
                <Logo size={26}/>
                <div style={{ fontSize:15, fontWeight:'bold', letterSpacing:3, background:C.gradFull, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>XANDRSCAN</div>
              </div>

              <div style={{ fontSize:11, color:C.textM, letterSpacing:1, marginBottom:2 }}>{chain.toUpperCase()}</div>
              <div style={{ fontSize:20, fontWeight:'bold', color:C.text, marginBottom:18 }}>
                {isRealValue(report.tokenName) ? report.tokenName : shortW(addr)}
                {isRealValue(report.symbol) && <span style={{ color:C.textM, fontWeight:'normal' }}> ({report.symbol})</span>}
              </div>

              <div style={{ textAlign:'center', padding:'20px 0', background:risk.bg, borderRadius:14, marginBottom:18 }}>
                <div style={{ fontSize:9, color:C.textM, letterSpacing:2, marginBottom:6 }}>RISK SCORE</div>
                <div style={{ fontSize:48, fontWeight:'bold', color:risk.color, lineHeight:1 }}>{report.riskScore}</div>
                <div style={{ fontSize:11, color:risk.color, letterSpacing:2, marginTop:6, fontWeight:'bold' }}>{risk.label}</div>
              </div>

              {(report.redFlags||[]).length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:9, color:C.danger, letterSpacing:1.5, marginBottom:6 }}>🚩 RED FLAGS</div>
                  {(report.redFlags||[]).slice(0,3).map((f,i) => (
                    <div key={i} style={{ fontSize:11, color:C.textM, marginBottom:3, lineHeight:1.5 }}>• {f}</div>
                  ))}
                </div>
              )}

              {(report.greenLights||[]).length > 0 && (
                <div style={{ marginBottom:6 }}>
                  <div style={{ fontSize:9, color:C.success, letterSpacing:1.5, marginBottom:6 }}>✅ GREEN LIGHTS</div>
                  {(report.greenLights||[]).slice(0,2).map((g,i) => (
                    <div key={i} style={{ fontSize:11, color:C.textM, marginBottom:3, lineHeight:1.5 }}>• {g}</div>
                  ))}
                </div>
              )}

              <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', marginTop:16, paddingTop:12, textAlign:'center' }}>
                <div style={{ fontSize:9, color:C.textD, letterSpacing:1 }}>xandrscan.vercel.app</div>
                <div style={{ fontSize:8, color:C.textD, marginTop:3 }}>Not financial advice · DYOR</div>
              </div>
            </div>
          </div>

          <div style={{ padding:'0 20px 28px' }}>
            <div style={{ fontSize:10, color:C.textM, textAlign:'center', marginBottom:14, letterSpacing:0.5 }}>Screenshot this card to share on X/CT</div>
            <button onClick={shareReport} style={{ width:'100%', padding:13, borderRadius:10, background:copied?'rgba(0,229,160,0.08)':C.surfaceB, border:copied?'1px solid rgba(0,229,160,0.3)':'1px solid rgba(255,255,255,0.06)', color:copied?C.success:C.textM, cursor:'pointer', fontSize:10, letterSpacing:1.5, fontFamily:'inherit' }}>
              {copied ? '✓ COPIED' : '📋 COPY AS TEXT INSTEAD'}
            </button>
          </div>
        </div>
      )}

      {modal === 'paywall' && (
        <Overlay>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:10 }}><Logo size={40}/></div>
          <MT>Upgrade Your Plan</MT>
          <MS>Pay via ETH on Base network. Price is calculated at live ETH rate.</MS>
          {['starter','pro','alpha'].map(t => (
            <div key={t} onClick={() => { setSelTier(t); setModal('pay') }}
              style={{ border:`1px solid ${TIERS[t].color}28`, borderRadius:10, padding:'13px 15px', marginBottom:9, display:'flex', justifyContent:'space-between', alignItems:'center', background:`${TIERS[t].color}08`, cursor:'pointer' }}>
              <div>
                <div style={{ fontSize:12, color:TIERS[t].color, fontWeight:'bold', letterSpacing:2 }}>{TIERS[t].label}</div>
                <div style={{ fontSize:11, color:C.textM, marginTop:3 }}>{TIERS[t].scans === 999999 ? 'Unlimited' : TIERS[t].scans} scans / month</div>
              </div>
              <div style={{ fontSize:14, color:C.text, fontWeight:'bold' }}>
                {t === 'starter' ? '$7' : t === 'pro' ? '$15' : '$50'}
              </div>
            </div>
          ))}
          <PBtn onClick={() => setModal('code')}>I HAVE A CODE →</PBtn>
          <GBtn onClick={() => setModal(null)}>Cancel</GBtn>
        </Overlay>
      )}

      {modal === 'pay' && selTier && (
        <Overlay>
          <MT>{selTier.toUpperCase()} — Send Payment</MT>
          <Surf style={{ marginBottom:12 }}>
            <FL>AMOUNT (calculated at live ETH price)</FL>
            <div style={{ fontSize:13, color:C.textM }}>Check live rate: tap "Get Quote" in app or visit coingecko.com/en/coins/ethereum</div>
            <div style={{ fontSize:11, color:C.gold, marginTop:6 }}>Approx: {selTier==='starter'?'~0.002':selTier==='pro'?'~0.004':'~0.015'} ETH</div>
          </Surf>
          <Surf style={{ marginBottom:12 }}>
            <FL>SEND TO (Base network only)</FL>
            <div style={{ fontSize:10, color:C.text, wordBreak:'break-all', lineHeight:1.9 }}>0x8676CD2adbf0A3C2676d2c9e1cc9252845C74839</div>
          </Surf>
          <div style={{ fontSize:11, color:C.gold, textAlign:'center', marginBottom:14, padding:10, background:'rgba(245,158,11,0.05)', borderRadius:8 }}>
            ⚠️ Base network only · Wrong network = lost funds permanently
          </div>
          <PBtn onClick={() => setModal('verify')}>I'VE SENT PAYMENT →</PBtn>
          <GBtn onClick={() => setModal('paywall')}>← Back</GBtn>
        </Overlay>
      )}

      {modal === 'verify' && (
        <Overlay>
          <MT>Verify Payment</MT>
          <MS>Paste your Base network transaction hash.</MS>
          <AI value={txHash} onChange={e => setTxHash(e.target.value)} placeholder="0x..." style={{ marginBottom:10 }}/>
          {vfMsg.text && <div style={{ fontSize:12, color:vfMsg.ok?C.success:C.danger, marginBottom:10 }}>{vfMsg.text}</div>}
          <PBtn onClick={verifyPayment} disabled={vfying}>{vfying ? '⟳ VERIFYING...' : '✓ VERIFY PAYMENT'}</PBtn>
          <GBtn onClick={() => setModal('pay')}>← Back</GBtn>
        </Overlay>
      )}

      {modal === 'code' && (
        <Overlay>
          <MT>Enter Access Code</MT>
          <MS>Owner or premium code? Redeem here.</MS>
          <AI value={codeIn} onChange={e => setCodeIn(e.target.value)} placeholder="XANDR-XXXX-XXXX" style={{ letterSpacing:2, marginBottom:8 }}/>
          {codeMsg.text && <div style={{ fontSize:12, color:codeMsg.ok?C.success:C.danger, marginBottom:10 }}>{codeMsg.text}</div>}
          <PBtn onClick={redeemCode}>UNLOCK ACCESS</PBtn>
          <GBtn onClick={() => setModal(null)}>Cancel</GBtn>
        </Overlay>
      )}

      {/* HEADER */}
      <div style={{ borderBottom:'1px solid rgba(0,194,255,0.1)', padding:'12px 18px', display:'flex', alignItems:'center', gap:10, background:'rgba(8,9,13,0.96)', backdropFilter:'blur(16px)', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ filter:'drop-shadow(0 0 8px rgba(0,194,255,0.45))' }}><Logo size={26}/></div>
        <div>
          <div style={{ fontSize:11, fontWeight:'bold', letterSpacing:3, background:C.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>XANDRSCAN</div>
          <div style={{ fontSize:8, color:C.textD, letterSpacing:2 }}>AI RISK INTELLIGENCE</div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          {usage && (
            <div style={{ fontSize:9, color:C.textD }}>
              {user?.tier === 'owner' ? '∞' : `${usage.remaining}/${usage.total}`} scans
            </div>
          )}
          <div style={{ fontSize:9, padding:'3px 10px', border:`1px solid ${cur.color}28`, borderRadius:20, color:cur.color, background:`${cur.color}0d` }}>
            {user?.tier === 'owner' ? '👑 OWNER' : cur.label}
          </div>
          <div style={{ fontSize:9, color:C.textD, padding:'2px 8px', border:'1px solid rgba(255,255,255,0.06)', borderRadius:20 }}>{shortW(address)}</div>
          {user?.tier === 'free' && <HC onClick={() => setModal('paywall')} c={C.blue}>UPGRADE</HC>}
          <HC onClick={() => setModal('code')} c={C.purple}>CODE</HC>
          <HC onClick={() => open()} c={C.textD}>WALLET</HC>
        </div>
      </div>

      {/* NAV TABS */}
      <div style={{ display:'flex', borderBottom:'1px solid rgba(255,255,255,0.05)', background:C.surface }}>
        {[['scan','🔍 SCAN'],['check','🛡️ CHECK'],['history','📋 HISTORY'],['watchlist','⭐ WATCHLIST']].map(([v,l]) => (
          <button key={v} onClick={() => setView(v)}
            style={{ flex:1, padding:'10px', fontSize:10, letterSpacing:1.5, fontFamily:'inherit', border:'none', cursor:'pointer', background:'transparent', color:view===v?C.blue:C.textD, borderBottom:view===v?`2px solid ${C.blue}`:'2px solid transparent' }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ padding:16, maxWidth:580, margin:'0 auto' }}>

        {/* ── SCAN VIEW ── */}
        {view === 'scan' && (
          <>
            {usage && typeof usage.remaining === 'number' && usage.remaining <= 2 && user?.tier !== 'owner' && (
              <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:9, padding:'9px 14px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:11, color:C.gold }}>⚠️ {usage.remaining} scan{usage.remaining !== 1 ? 's' : ''} remaining</span>
                <HC onClick={() => setModal('paywall')} c={C.gold}>UPGRADE</HC>
              </div>
            )}

            <Surf style={{ marginBottom:14 }}>
              <FL>CONTRACT ADDRESS</FL>
              <AI value={addr} onChange={e => setAddr(e.target.value)} placeholder="Paste token address..." onKeyDown={e => e.key === 'Enter' && analyze()} style={{ marginBottom:11 }}/>
              <FL>CHAIN</FL>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:13 }}>
                {CHAINS.map(c => (
                  <button key={c.id} onClick={() => setChain(c.id)}
                    style={{ padding:'6px 13px', borderRadius:7, cursor:'pointer', fontSize:10, letterSpacing:1.5, fontFamily:'inherit', border:chain===c.id?`1px solid ${C.blue}`:'1px solid rgba(255,255,255,0.06)', background:chain===c.id?'rgba(0,194,255,0.1)':C.surfaceB, color:chain===c.id?C.blue:C.textD }}>
                    {c.label}
                  </button>
                ))}
              </div>
              <button onClick={analyze} disabled={loading || !addr.trim()}
                style={{ width:'100%', padding:13, borderRadius:9, background:loading?C.surfaceB:C.grad, color:loading?C.textD:'#fff', border:loading?'1px solid rgba(255,255,255,0.05)':'none', cursor:loading?'not-allowed':'pointer', fontSize:11, fontWeight:'bold', letterSpacing:2.5, fontFamily:'inherit', boxShadow:!loading?'0 0 24px rgba(0,194,255,0.22)':'none' }}>
                {loading ? '⟳  SCANNING...' : `⚡  ANALYZE TOKEN`}
              </button>
            </Surf>

            {loading && (
              <div style={{ textAlign:'center', padding:28, color:C.textD, fontSize:10, letterSpacing:2 }}>
                <div style={{ color:C.blue, fontSize:22, marginBottom:8 }}>⟳</div>
                FETCHING ON-CHAIN DATA<br/><span style={{ fontSize:9 }}>RUNNING RUG DNA ANALYSIS</span>
              </div>
            )}

            {err && <div style={{ background:'rgba(255,69,96,0.07)', border:'1px solid rgba(255,69,96,0.22)', borderRadius:9, padding:13, color:C.danger, fontSize:12, lineHeight:1.7, marginBottom:12 }}>{err}</div>}

            {report && risk && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

                {/* SCORE */}
                <div style={{ background:risk.bg, border:`1px solid ${risk.color}22`, borderRadius:13, padding:20, textAlign:'center', boxShadow:`0 0 40px ${risk.glow}` }}>
                  <div style={{ fontSize:9, color:C.textM, letterSpacing:3, marginBottom:5 }}>RISK SCORE</div>
                  <div style={{ fontSize:56, fontWeight:'bold', color:risk.color, lineHeight:1 }}>{report.riskScore}</div>
                  <div style={{ fontSize:10, color:risk.color, letterSpacing:4, marginTop:5 }}>{risk.label}</div>
                  <div style={{ fontSize:13, color:C.textM, marginTop:10, fontStyle:'italic', lineHeight:1.6 }}>"{report.verdict}"</div>
                </div>

                {/* LIVE MARKET DATA */}
                {dex && (
                  <Surf>
                    <FL>LIVE MARKET DATA</FL>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:7 }}>
                      {[['Price',`$${Number(dex.price||0).toFixed(8)}`],['Liquidity',`$${fmt(dex.liquidity)}`],['24h Volume',`$${fmt(dex.volume24h)}`],['24h Change',`${dex.priceChange24h>0?'+':''}${dex.priceChange24h}%`],['Buys/Sells',`${dex.buys24h}/${dex.sells24h}`],['Market Cap',`$${fmt(dex.marketCap)}`]].map(([l,v]) => (
                        <div key={l} style={{ background:C.bg, borderRadius:8, padding:10, border:'1px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ fontSize:8, color:C.textD, marginBottom:3 }}>{l}</div>
                          <div style={{ fontSize:12, color:C.text, fontWeight:'bold' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </Surf>
                )}

                {/* FLAGS */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
                  <div style={{ background:'rgba(255,69,96,0.05)', border:'1px solid rgba(255,69,96,0.15)', borderRadius:11, padding:13 }}>
                    <FL style={{ color:C.danger }}>🚩 RED FLAGS</FL>
                    {(report.redFlags||[]).map((f,i) => <div key={i} style={{ fontSize:11, color:C.textM, marginBottom:6, lineHeight:1.6 }}>• {f}</div>)}
                  </div>
                  <div style={{ background:'rgba(0,229,160,0.05)', border:'1px solid rgba(0,229,160,0.15)', borderRadius:11, padding:13 }}>
                    <FL style={{ color:C.success }}>✅ GREEN</FL>
                    {(report.greenLights||[]).map((g,i) => <div key={i} style={{ fontSize:11, color:C.textM, marginBottom:6, lineHeight:1.6 }}>• {g}</div>)}
                  </div>
                </div>

                {/* DEPLOYER HISTORY — separate from the general risk score on purpose */}
                {report.deployerHistory ? (
                  <div style={{
                    background: report.deployerHistory.isMalicious ? 'rgba(255,69,96,0.08)' : 'rgba(0,194,255,0.05)',
                    border: `1px solid ${report.deployerHistory.isMalicious ? 'rgba(255,69,96,0.3)' : 'rgba(0,194,255,0.15)'}`,
                    borderRadius:11, padding:13
                  }}>
                    <FL style={{ color: report.deployerHistory.isMalicious ? C.danger : C.blue }}>🕵️ DEPLOYER HISTORY</FL>
                    <div style={{ fontSize:11, color:C.textM, marginBottom:8 }}>{report.deployerHistory.deployerAddress.slice(0,10)}...<AddrTools address={report.deployerHistory.deployerAddress} chain={chain} copiedAddr={copiedAddr} onCopy={copyAddr} /></div>
                    {report.deployerHistory.isMalicious && (
                      <div style={{ fontSize:11, color:C.danger, marginBottom:8, lineHeight:1.6 }}>
                        ⚠️ This deployer wallet is flagged for known malicious activity ({report.deployerHistory.maliciousFlags.join(', ').replaceAll('_',' ')})
                      </div>
                    )}
                    {report.deployerHistory.otherTokensCount > 0 ? (
                      <div style={{ fontSize:12, color:C.textM, lineHeight:1.6 }}>
                        This wallet has deployed <b style={{ color:C.text }}>{report.deployerHistory.otherTokensCount}</b> other token{report.deployerHistory.otherTokensCount === 1 ? '' : 's'} we've scanned
                        {report.deployerHistory.highRiskCount > 0 && (
                          <> — <b style={{ color:C.danger }}>{report.deployerHistory.highRiskCount}</b> came back high-risk</>
                        )}
                        .
                      </div>
                    ) : (
                      <div style={{ fontSize:11, color:C.textD }}>No other tokens from this deployer in our scan history yet.</div>
                    )}
                    <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize:9, color:C.textD, marginBottom:4 }}>FUNDED BY</div>
                      {report.deployerHistory.funderAddress ? (
                        <>
                          <div style={{ fontSize:11, color:C.textM, marginBottom:4 }}>{report.deployerHistory.funderAddress.slice(0,10)}...<AddrTools address={report.deployerHistory.funderAddress} chain={chain} copiedAddr={copiedAddr} onCopy={copyAddr} /></div>
                          {report.deployerHistory.funderIsMalicious && (
                            <div style={{ fontSize:11, color:C.danger, marginBottom:4 }}>
                              ⚠️ This funding wallet is flagged for known malicious activity ({report.deployerHistory.funderMaliciousFlags.join(', ').replaceAll('_',' ')})
                            </div>
                          )}
                          {report.deployerHistory.funderOtherDeployersCount > 0 ? (
                            <div style={{ fontSize:12, color:C.textM, lineHeight:1.6 }}>
                              This wallet has funded <b style={{ color:C.text }}>{report.deployerHistory.funderOtherDeployersCount}</b> other deployer wallet{report.deployerHistory.funderOtherDeployersCount === 1 ? '' : 's'}
                              {report.deployerHistory.funderHighRiskDeployersCount > 0 && (
                                <> — <b style={{ color:C.danger }}>{report.deployerHistory.funderHighRiskDeployersCount}</b> went on to deploy high-risk tokens</>
                              )}
                              .
                            </div>
                          ) : (
                            <div style={{ fontSize:11, color:C.textD }}>No other deployer wallets traced to this funder yet.</div>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize:11, color:C.textD }}>No funder wallet identified for this deployer yet.</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#0E1420', border:'1px solid rgba(255,255,255,0.05)', borderRadius:11, padding:13 }}>
                    <FL>🕵️ DEPLOYER HISTORY</FL>
                    <div style={{ fontSize:11, color:C.textD }}>No deployer data indexed for this token yet — common for very new or low-liquidity tokens. Try rescanning later.</div>
                  </div>
                )}
                {report.rugDNA?.locked ? (
                  <div style={{ background:'rgba(168,85,247,0.05)', border:'1px solid rgba(168,85,247,0.2)', borderRadius:11, padding:16, textAlign:'center' }}>
                    <div style={{ fontSize:12, color:C.purple, marginBottom:6 }}>🧬 RUG DNA LOCKED</div>
                    <div style={{ fontSize:11, color:C.textD, marginBottom:12 }}>{report.rugDNA.message}</div>
                    <button onClick={() => setModal('paywall')} style={{ padding:'8px 20px', borderRadius:8, background:C.grad, color:'#fff', border:'none', cursor:'pointer', fontSize:10, fontWeight:'bold', fontFamily:'inherit' }}>UPGRADE TO PRO</button>
                  </div>
                ) : report.rugDNA && (
                  <div style={{ background:'rgba(168,85,247,0.05)', border:'1px solid rgba(168,85,247,0.2)', borderRadius:11, padding:13 }}>
                    <FL style={{ color:C.purple }}>🧬 RUG DNA ANALYSIS</FL>
                    {(report.rugDNA.patterns||[]).map((p,i) => <div key={i} style={{ fontSize:11, color:C.textM, marginBottom:6, lineHeight:1.6 }}>• {p}</div>)}
                    <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid rgba(168,85,247,0.12)', fontSize:11, color:C.textD, lineHeight:1.75, fontStyle:'italic' }}>{report.rugDNA.historicalVerdict}</div>
                    {report.rugDNA.timeRisk && <div style={{ marginTop:7, fontSize:10, color:C.purple }}>⏱ {report.rugDNA.timeRisk}</div>}
                    {report.rugDNA.similarTokens?.length > 0 ? (
                      <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid rgba(168,85,247,0.12)' }}>
                        <FL style={{ color:C.purple, marginBottom:8 }}>SIMILAR TOKENS FROM DATABASE</FL>
                        {report.rugDNA.similarTokens.map((t,i) => (
                          <div key={i} style={{ background:C.bg, borderRadius:8, padding:10, marginBottom:6, border:'1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                              <span style={{ fontSize:12, color:C.text, fontWeight:'bold' }}>{t.name} {isRealValue(t.symbol) && `(${t.symbol})`}</span>
                              <span style={{ fontSize:11, color:C.purple }}>{t.similarityScore}% match</span>
                            </div>
                            {t.riskScore != null && <div style={{ fontSize:10, color:C.textD, marginBottom:3 }}>Historical risk score: {t.riskScore}/100</div>}
                            {t.matchReason && <div style={{ fontSize:10, color:C.textM, marginBottom:3 }}>{t.matchReason}</div>}
                            {t.verdict && <div style={{ fontSize:10, color:C.textD, fontStyle:'italic' }}>"{t.verdict}"</div>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid rgba(168,85,247,0.12)' }}>
                        <FL style={{ color:C.purple, marginBottom:8 }}>SIMILAR TOKENS FROM DATABASE</FL>
                        <div style={{ fontSize:11, color:C.textD, lineHeight:1.6 }}>No tokens with a similar risk profile have been confirmed as rugs yet — this doesn't mean this token is safe, just that there's no confirmed historical match to compare it to.</div>
                      </div>
                    )}
                  </div>
                )}

                {/* SUMMARY */}
                <Surf>
                  <FL>📋 PLAIN ENGLISH SUMMARY</FL>
                  <div style={{ fontSize:13, color:C.text, lineHeight:1.9 }}>{report.plainEnglishSummary}</div>
                </Surf>

                {/* ADVICE */}
                <div style={{ background:risk.bg, border:`1px solid ${risk.color}18`, borderRadius:11, padding:13 }}>
                  <FL style={{ color:risk.color }}>⚡ WHAT TO DO</FL>
                  <div style={{ fontSize:13, color:C.text, lineHeight:1.8, fontWeight:500 }}>{report.actionableAdvice}</div>
                </div>

                {/* KEY METRICS */}
                <Surf>
                  <FL>🔍 KEY METRICS</FL>
                  {Object.entries(report.keyMetrics||{}).map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid rgba(255,255,255,0.04)', paddingBottom:7, marginBottom:7, gap:10 }}>
                      <div style={{ fontSize:9, color:C.textD, letterSpacing:1.5, minWidth:108, textTransform:'uppercase' }}>{k.replace(/([A-Z])/g,' $1')}</div>
                      <div style={{ fontSize:11, color:C.textM, textAlign:'right', lineHeight:1.6 }}>{v}</div>
                    </div>
                  ))}
                </Surf>

                {/* HOLDER ANALYSIS (Pro+) */}
                {report.holderAnalysis?.locked ? (
                  <div style={{ background:C.surfaceB, border:'1px solid rgba(255,255,255,0.05)', borderRadius:11, padding:14, textAlign:'center' }}>
                    <div style={{ fontSize:11, color:C.textD, marginBottom:8 }}>🔒 {report.holderAnalysis.message}</div>
                    <button onClick={() => setModal('paywall')} style={{ padding:'6px 16px', borderRadius:7, background:C.grad, color:'#fff', border:'none', cursor:'pointer', fontSize:10, fontFamily:'inherit' }}>UPGRADE TO PRO</button>
                  </div>
                ) : report.holderAnalysis && (
                  <Surf>
                    <FL>👥 HOLDER ANALYSIS</FL>
                    {(!report.holderAnalysis.topHolders || report.holderAnalysis.topHolders.length === 0) && !report.holderAnalysis.creatorAddress ? (
                      <div style={{ fontSize:10, color:C.textD, fontStyle:'italic' }}>
                        No holder data indexed for this token yet — common for very new or low-liquidity tokens. Try rescanning later.
                      </div>
                    ) : (
                      <>
                        {report.holderAnalysis.concentrationTier && report.holderAnalysis.concentrationTier !== 'unknown' && (
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                            <div style={{
                              fontSize:9, letterSpacing:1.5, padding:'4px 10px', borderRadius:6, fontWeight:'bold',
                              color: {extreme:'#ff4d4d', high:'#ff9f45', moderate:'#ffd166', healthy:'#4ade80'}[report.holderAnalysis.concentrationTier],
                              background: {extreme:'rgba(255,77,77,0.12)', high:'rgba(255,159,69,0.12)', moderate:'rgba(255,209,102,0.12)', healthy:'rgba(74,222,128,0.12)'}[report.holderAnalysis.concentrationTier],
                            }}>
                              {report.holderAnalysis.concentrationTier.toUpperCase()} CONCENTRATION
                            </div>
                            {report.holderAnalysis.top10Percent != null && (
                              <div style={{ fontSize:10, color:C.textD }}>Top 10: {report.holderAnalysis.top10Percent.toFixed(1)}%</div>
                            )}
                          </div>
                        )}
                        {report.holderAnalysis.flags?.length > 0 && (
                          <div style={{ marginBottom:10 }}>
                            {report.holderAnalysis.flags.map((f,i) => (
                              <div key={i} style={{ fontSize:10, color:'#ff9f45', marginBottom:4 }}>⚠️ {f}</div>
                            ))}
                          </div>
                        )}
                        {report.holderAnalysis.creatorAddress && (
                          <div style={{ marginBottom:8 }}>
                            <div style={{ fontSize:9, color:C.textD, marginBottom:3 }}>CREATOR</div>
                            <div style={{ fontSize:10, color:C.textM }}>{report.holderAnalysis.creatorAddress.slice(0,12)}... holds {report.holderAnalysis.creatorPercent?.toFixed(2)}%<AddrTools address={report.holderAnalysis.creatorAddress} chain={chain} copiedAddr={copiedAddr} onCopy={copyAddr} /></div>
                          </div>
                        )}
                        {(report.holderAnalysis.topHolders||[]).slice(0,5).map((h,i) => {
                          const isWhale = report.holderAnalysis.whaleWallets?.some(w => w.address === h.address)
                          return (
                            <div key={i} style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid rgba(255,255,255,0.04)', paddingBottom:6, marginBottom:6 }}>
                              <div style={{ fontSize:10, color:C.textD }}>{i+1}. {h.tag || (h.address||'').slice(0,10)}...{isWhale ? ' 🐋' : ''}<AddrTools address={h.address} chain={chain} copiedAddr={copiedAddr} onCopy={copyAddr} /></div>
                              <div style={{ fontSize:10, color:C.textM }}>{h.percent || h.pct}%{h.isLocked?' 🔒':''}</div>
                        </div>
                      )
                    })}
                      </>
                    )}
                  </Surf>
                )}

                {/* ACTIONS */}
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => setModal('share')} style={{ flex:1, padding:13, borderRadius:10, background:C.surfaceB, border:'1px solid rgba(255,255,255,0.06)', color:C.textM, cursor:'pointer', fontSize:10, letterSpacing:1.5, fontFamily:'inherit' }}>
                    📤 SHARE
                  </button>
                  {user && ['starter','pro','alpha','owner'].includes(user.tier) && (
                    <button onClick={addToWatchlist} style={{ flex:1, padding:13, borderRadius:10, background:C.surfaceB, border:'1px solid rgba(255,255,255,0.06)', color:C.textM, cursor:'pointer', fontSize:10, letterSpacing:1.5, fontFamily:'inherit' }}>
                      ⭐ WATCHLIST
                    </button>
                  )}
                </div>

                {user?.tier === 'free' && (
                  <div style={{ background:'rgba(0,194,255,0.04)', border:'1px solid rgba(0,194,255,0.15)', borderRadius:11, padding:15, textAlign:'center' }}>
                    <div style={{ fontSize:12, color:C.blue, letterSpacing:2, marginBottom:4 }}>UNLOCK THE FULL PICTURE</div>
                    <div style={{ fontSize:11, color:C.textM, marginBottom:12 }}>Rug DNA · Holder Analysis · Scan History · Watchlist</div>
                    <button onClick={() => setModal('paywall')} style={{ padding:'10px 26px', borderRadius:8, background:C.grad, color:'#fff', border:'none', cursor:'pointer', fontSize:10, fontWeight:'bold', letterSpacing:2, fontFamily:'inherit' }}>UPGRADE NOW</button>
                  </div>
                )}

                <div style={{ fontSize:9, color:C.textD, textAlign:'center', lineHeight:1.9, padding:8 }}>
                  Confidence: {report.dataConfidence?.toUpperCase()} · Not financial advice · Scans are probabilistic · DYOR
                </div>
              </div>
            )}
          </>
        )}

        {/* ── CHECK VIEW (approval/phishing) ── */}
        {view === 'check' && (
          <>
            <Surf style={{ marginBottom:14 }}>
              <FL>URL OR WALLET ADDRESS</FL>
              <AI value={checkQuery} onChange={e => setCheckQuery(e.target.value)} placeholder="Paste a URL or wallet address..." onKeyDown={e => e.key === 'Enter' && runCheck()} style={{ marginBottom:11 }}/>
              <FL>CHAIN <span style={{ color:C.textD }}>(only matters for addresses)</span></FL>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:13 }}>
                {CHAINS.map(c => (
                  <button key={c.id} onClick={() => setCheckChain(c.id)}
                    style={{ padding:'6px 13px', borderRadius:7, cursor:'pointer', fontSize:10, letterSpacing:1.5, fontFamily:'inherit', border:checkChain===c.id?`1px solid ${C.blue}`:'1px solid rgba(255,255,255,0.06)', background:checkChain===c.id?'rgba(0,194,255,0.1)':C.surfaceB, color:checkChain===c.id?C.blue:C.textD }}>
                    {c.label}
                  </button>
                ))}
              </div>
              <button onClick={runCheck} disabled={checkLoading || !checkQuery.trim()}
                style={{ width:'100%', padding:13, borderRadius:9, background:checkLoading?C.surfaceB:C.grad, color:checkLoading?C.textD:'#fff', border:checkLoading?'1px solid rgba(255,255,255,0.05)':'none', cursor:checkLoading?'not-allowed':'pointer', fontSize:11, fontWeight:'bold', letterSpacing:2.5, fontFamily:'inherit', boxShadow:!checkLoading?'0 0 24px rgba(0,194,255,0.22)':'none' }}>
                {checkLoading ? '⟳  CHECKING...' : `🛡️  RUN CHECK`}
              </button>
            </Surf>

            {checkLoading && (
              <div style={{ textAlign:'center', padding:28, color:C.textD, fontSize:10, letterSpacing:2 }}>
                <div style={{ color:C.blue, fontSize:22, marginBottom:8 }}>⟳</div>
                CHECKING AGAINST KNOWN THREAT DATA
              </div>
            )}

            {checkErr && <div style={{ background:'rgba(255,69,96,0.07)', border:'1px solid rgba(255,69,96,0.22)', borderRadius:9, padding:13, color:C.danger, fontSize:12, lineHeight:1.7, marginBottom:12 }}>{checkErr}</div>}

            {checkResult && (() => {
              // Three states, deliberately never collapsed into a plain
              // safe/unsafe toggle — a clean result means "nothing found
              // yet", not "confirmed safe". See computeApprovalVerdict in
              // the backend for why.
              const st = checkResult.verdict.state
              const styleFor = {
                known_malicious: { color: C.danger,  bg: 'rgba(255,69,96,0.07)',  border: 'rgba(255,69,96,0.25)',  label: '🚩 FLAGGED — KNOWN MALICIOUS' },
                known_safe:      { color: C.success, bg: 'rgba(0,255,178,0.06)',  border: 'rgba(0,255,178,0.22)',  label: '✅ ON TRUSTED LIST' },
                no_history:      { color: C.gold,     bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)',  label: '🕳️ NO HISTORY FOUND YET' },
                unknown:         { color: C.textD,    bg: C.surfaceB,              border: 'rgba(255,255,255,0.06)', label: '⚠️ CHECK INCOMPLETE' },
              }[st] || { color: C.textD, bg: C.surfaceB, border: 'rgba(255,255,255,0.06)', label: st }

              return (
                <div style={{ background: styleFor.bg, border: `1px solid ${styleFor.border}`, borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5, color: styleFor.color, marginBottom: 10 }}>{styleFor.label}</div>
                  <div style={{ fontSize: 11, color: C.textM, marginBottom: 12, wordBreak: 'break-all' }}>
                    {checkResult.query}
                    <AddrTools address={checkResult.queryType === 'address' ? checkResult.query : null} chain={checkResult.chain} copiedAddr={copiedAddr} onCopy={copyAddr} />
                  </div>
                  {checkResult.narrative && (
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: checkResult.verdict.flags.length ? 12 : 0 }}>
                      {checkResult.narrative}
                    </div>
                  )}
                  {checkResult.verdict.flags.length > 0 && (
                    <div>
                      {checkResult.verdict.flags.map((f, i) => (
                        <div key={i} style={{ fontSize: 10, color: styleFor.color, marginBottom: 4 }}>• {f.replace(/_/g, ' ')}</div>
                      ))}
                    </div>
                  )}
                  {(st === 'no_history' || st === 'unknown') && (
                    <div style={{ fontSize: 9, color: C.textD, marginTop: 12, lineHeight: 1.6 }}>
                      {st === 'no_history'
                        ? 'This means nothing malicious has been reported yet — not that it\u2019s confirmed safe.'
                        : 'The underlying check didn\u2019t return usable data, so no assessment could be made at all.'}
                    </div>
                  )}
                </div>
              )
            })()}

            <div style={{ fontSize:9, color:C.textD, textAlign:'center', lineHeight:1.9, padding:8 }}>
              Not financial advice · Checks reflect known/reported activity only · DYOR
            </div>
          </>
        )}

        {/* ── HISTORY VIEW ── */}
        {view === 'history' && (
          <div>
            {!['starter','pro','alpha','owner'].includes(user?.tier) ? (
              <div style={{ textAlign:'center', padding:40 }}>
                <div style={{ fontSize:14, color:C.textM, marginBottom:16 }}>Scan history is a Starter+ feature.</div>
                <button onClick={() => setModal('paywall')} style={{ padding:'10px 24px', borderRadius:8, background:C.grad, color:'#fff', border:'none', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>UPGRADE TO STARTER</button>
              </div>
            ) : history.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:C.textD, fontSize:12 }}>No scans yet. Start scanning tokens!</div>
            ) : (
              <>
                {history.map((h, i) => (
                  <div key={i} onClick={() => { setAddr(h.token_address); setChain(h.chain); setView('scan') }}
                    style={{ background:C.surface, border:'1px solid rgba(255,255,255,0.05)', borderRadius:10, padding:14, marginBottom:8, cursor:'pointer' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:13, color:C.text, fontWeight:'bold' }}>{h.token_name || 'Unknown'} ({h.symbol || '?'})</span>
                      <span style={{ fontSize:12, color:h.risk_score>65?C.danger:h.risk_score>35?C.gold:C.success, fontWeight:'bold' }}>{h.risk_score}/100</span>
                    </div>
                    <div style={{ fontSize:10, color:C.textD }}>{h.chain.toUpperCase()} · {new Date(h.created_at).toLocaleDateString()}</div>
                    <div style={{ fontSize:11, color:C.textM, marginTop:4 }}>{h.verdict}</div>
                  </div>
                ))}
                <div style={{ display:'flex', gap:8, marginTop:12 }}>
                  {histPage > 1 && <button onClick={() => loadHistory(histPage-1)} style={{ flex:1, padding:10, borderRadius:8, background:C.surfaceB, border:'1px solid rgba(255,255,255,0.06)', color:C.textM, cursor:'pointer', fontFamily:'inherit', fontSize:11 }}>← PREV</button>}
                  {history.length === 20 && <button onClick={() => loadHistory(histPage+1)} style={{ flex:1, padding:10, borderRadius:8, background:C.surfaceB, border:'1px solid rgba(255,255,255,0.06)', color:C.textM, cursor:'pointer', fontFamily:'inherit', fontSize:11 }}>NEXT →</button>}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── WATCHLIST VIEW ── */}
        {view === 'watchlist' && (
          <div>
            {['alpha', 'owner'].includes(user?.tier) && (
              <div style={{ background:C.surface, border:'1px solid rgba(255,255,255,0.05)', borderRadius:10, padding:14, marginBottom:12 }}>
                {usage?.telegramLinked ? (
                  <div style={{ fontSize:12, color:C.success }}>✅ Telegram linked — alerts go out when a watchlisted token's risk jumps</div>
                ) : tgLink ? (
                  <div>
                    <a href={tgLink.deepLink} target="_blank" rel="noreferrer" style={{ fontSize:12, color:C.blue, textDecoration:'none' }}>Open Telegram to confirm →</a>
                    <div style={{ fontSize:10, color:C.textD, marginTop:4 }}>Code expires in {tgLink.expiresInMinutes} min</div>
                  </div>
                ) : (
                  <button onClick={generateTelegramLink} disabled={tgLoading}
                    style={{ padding:'10px 16px', borderRadius:8, background:C.grad, color:'#fff', border:'none', cursor:'pointer', fontSize:10, letterSpacing:1, fontFamily:'inherit' }}>
                    {tgLoading ? 'GENERATING...' : '🔗 LINK TELEGRAM FOR ALERTS'}
                  </button>
                )}
              </div>
            )}
            {!['starter','pro','alpha','owner'].includes(user?.tier) ? (
              <div style={{ textAlign:'center', padding:40 }}>
                <div style={{ fontSize:14, color:C.textM, marginBottom:16 }}>Watchlist is a Starter+ feature.</div>
                <button onClick={() => setModal('paywall')} style={{ padding:'10px 24px', borderRadius:8, background:C.grad, color:'#fff', border:'none', cursor:'pointer', fontSize:11, fontFamily:'inherit' }}>UPGRADE TO STARTER</button>
              </div>
            ) : watchlist.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:C.textD, fontSize:12 }}>No tokens watched yet. Scan a token and tap ⭐ to add it.</div>
            ) : (
              watchlist.map((w, i) => {
                const riskColor = !w.risk_score_snapshot ? C.textD : w.risk_score_snapshot > 65 ? C.danger : w.risk_score_snapshot > 35 ? C.gold : C.success
                return (
                  <div key={i} style={{ background:C.surface, border:'1px solid rgba(255,255,255,0.05)', borderRadius:10, padding:14, marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                      <div>
                        <div style={{ fontSize:13, color:C.text, fontWeight:'bold' }}>{w.token_name || 'Unknown'} ({w.symbol || '?'})</div>
                        <div style={{ fontSize:10, color:C.textD, marginTop:2 }}>{w.chain.toUpperCase()} · Added {new Date(w.added_at).toLocaleDateString()}</div>
                      </div>
                      {w.risk_score_snapshot && <div style={{ fontSize:14, color:riskColor, fontWeight:'bold' }}>{w.risk_score_snapshot}</div>}
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => { setAddr(w.token_address); setChain(w.chain); setView('scan') }}
                        style={{ flex:1, padding:'7px', borderRadius:7, background:C.grad, color:'#fff', border:'none', cursor:'pointer', fontSize:10, fontFamily:'inherit' }}>RESCAN</button>
                      <button onClick={() => removeFromWatchlist(w.token_address, w.chain)}
                        style={{ padding:'7px 14px', borderRadius:7, background:'rgba(255,69,96,0.08)', border:'1px solid rgba(255,69,96,0.2)', color:C.danger, cursor:'pointer', fontSize:10, fontFamily:'inherit' }}>REMOVE</button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

      </div>
    </div>
  )
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────
function Surf({ children, style={} }) { return <div style={{ background:'#0E1420', border:'1px solid rgba(255,255,255,0.05)', borderRadius:11, padding:13, ...style }}>{children}</div> }
function FL({ children, style={} })   { return <div style={{ fontSize:9, color:'#4A5568', letterSpacing:2.5, marginBottom:8, textAlign:'left', ...style }}>{children}</div> }
function AI({ style={}, ...props })   { return <input {...props} style={{ width:'100%', background:'#08090D', border:'1px solid rgba(0,194,255,0.18)', borderRadius:8, padding:'12px 14px', color:'#F0F4FF', fontFamily:'inherit', fontSize:13, outline:'none', boxSizing:'border-box', marginBottom:3, ...style }}/> }
function PBtn({ children, onClick, disabled, className }) { return <button onClick={onClick} disabled={disabled} className={className} style={{ width:'100%', padding:13, borderRadius:9, background:disabled?'#111827':'linear-gradient(135deg,#00C2FF,#A855F7)', color:disabled?'#4A5568':'#fff', border:'none', cursor:disabled?'not-allowed':'pointer', fontSize:11, fontWeight:'bold', letterSpacing:2, fontFamily:'inherit', marginTop:12 }}>{children}</button> }
function GBtn({ children, onClick })  { return <button onClick={onClick} style={{ width:'100%', padding:10, borderRadius:9, background:'transparent', color:'#94A3B8', border:'1px solid rgba(255,255,255,0.07)', cursor:'pointer', fontSize:11, fontFamily:'inherit', marginTop:8 }}>{children}</button> }
function Overlay({ children })        { return <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20, backdropFilter:'blur(6px)' }}><div style={{ background:'#0E1420', border:'1px solid rgba(0,194,255,0.18)', borderRadius:16, padding:'24px 20px', maxWidth:400, width:'100%', maxHeight:'90vh', overflowY:'auto' }}>{children}</div></div> }
function MT({ children })             { return <div style={{ fontSize:15, fontWeight:'bold', color:'#F0F4FF', marginBottom:5, textAlign:'center', letterSpacing:1 }}>{children}</div> }
function MS({ children })             { return <div style={{ fontSize:12, color:'#94A3B8', marginBottom:18, textAlign:'center', lineHeight:1.7 }}>{children}</div> }
function HC({ children, onClick, c }) { return <button onClick={onClick} style={{ fontSize:9, padding:'3px 9px', border:`1px solid ${c}22`, borderRadius:20, color:c, background:`${c}09`, cursor:'pointer', fontFamily:'inherit', letterSpacing:1.5 }}>{children}</button> }
function AddrTools({ address, chain, copiedAddr, onCopy }) {
  if (!address) return null
  const url = EXPLORER_URL[chain]
  const isCopied = copiedAddr === address
  return (
    <span style={{ display:'inline-flex', gap:8, marginLeft:7, verticalAlign:'middle' }}>
      <span onClick={e => { e.stopPropagation(); onCopy(address) }} title="Copy address" style={{ cursor:'pointer', fontSize:11, opacity: isCopied ? 1 : 0.7 }}>
        {isCopied ? '✅' : '📋'}
      </span>
      {url && (
        <a href={`${url}${address}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="View on block explorer" style={{ fontSize:11, textDecoration:'none', opacity:0.7 }}>
          🔗
        </a>
      )}
    </span>
  )
}
