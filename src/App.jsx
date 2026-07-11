import { useState, useEffect, useCallback } from 'react'
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

const C = {
  bg:'#08090D', surface:'#0E1420', surfaceB:'#111827',
  border:'rgba(0,194,255,0.12)',
  blue:'#00C2FF', purple:'#A855F7', gold:'#F59E0B',
  text:'#F0F4FF', textM:'#94A3B8', textD:'#4A5568',
  danger:'#FF4560', success:'#00E5A0',
  grad:'linear-gradient(135deg,#00C2FF,#A855F7)',
  gradFull:'linear-gradient(135deg,#00C2FF 0%,#A855F7 60%,#F59E0B 100%)',
}

const getRisk = s => {
  if (s <= 35) return { color:C.success, label:'LOW RISK',      bg:'rgba(0,229,160,0.07)',  glow:'rgba(0,229,160,0.2)'  }
  if (s <= 65) return { color:C.gold,    label:'MODERATE RISK', bg:'rgba(245,158,11,0.07)', glow:'rgba(245,158,11,0.2)' }
  return             { color:C.danger,   label:'HIGH RISK',     bg:'rgba(255,69,96,0.07)',  glow:'rgba(255,69,96,0.2)'  }
}

const fmt    = n => Number(n||0).toLocaleString()
const shortW = w => w ? `${w.slice(0,6)}...${w.slice(-4)}` : ''
const LS     = {
  get:  k    => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):null } catch { return null } },
  set:  (k,v)=> { try { localStorage.setItem(k,JSON.stringify(v)) } catch {} },
  del:  k    => { try { localStorage.removeItem(k) } catch {} },
}

const api = async (path, body) => {
  const r = await fetch(`${WORKER}${path}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
  })
  return r.json()
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
        <linearGradient id="lgSh" x1="0%" y1="0%" x2="30%" y2="100%">
          <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0.6"/>
          <stop offset="28%"  stopColor="#FFFFFF" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="88" fill="rgba(0,160,255,0.07)"/>
      <polygon points="15,15 4,26 174,196 185,185 196,174 26,4"   fill="rgba(0,0,12,0.8)"/>
      <polygon points="185,15 196,26 26,196 15,185 4,174 174,4"   fill="rgba(0,0,12,0.8)"/>
      <polygon points="15,15 4,26 174,196 185,185 196,174 26,4"   fill="url(#lgM)"/>
      <polygon points="15,15 4,26 174,196 185,185 196,174 26,4"   fill="url(#lgSh)"/>
      <polygon points="185,15 196,26 26,196 15,185 4,174 174,4"   fill="url(#lgM)"/>
      <polygon points="185,15 196,26 26,196 15,185 4,174 174,4"   fill="url(#lgSh)"/>
      <path d="M 150,32 C 150,32 74,26 54,66 C 34,106 106,118 124,140 C 142,162 134,184 58,190" stroke="#003888" strokeWidth="50" strokeLinecap="round" fill="none"/>
      <path d="M 150,32 C 150,32 74,26 54,66 C 34,106 106,118 124,140 C 142,162 134,184 58,190" stroke="url(#lgS)" strokeWidth="46" strokeLinecap="round" fill="none"/>
      <path d="M 150,32 C 150,32 74,26 54,66 C 34,106 106,118 124,140 C 142,162 134,184 58,190" stroke="url(#lgSh)" strokeWidth="46" strokeLinecap="round" fill="none"/>
      <path d="M 149,33 C 149,33 76,27 57,66 C 38,105 108,118 125,140" stroke="#B8F0FF" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.9"/>
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

  // ── AUTH FLOW ──────────────────────────────────────────────────────
  const withTimeout = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), ms)),
    ])

  const signIn = useCallback(async () => {
    if (!address) return
    setSigning(true); setAuthErr('')
    try {
      const { nonce, message } = await withTimeout(api('/auth-nonce', { wallet: address }), 15000, 'Nonce request')
      if (!nonce) throw new Error('Failed to get nonce')
      const signature = await withTimeout(signMessageAsync({ message }), 90000, 'Wallet signature')
      const result = await withTimeout(api('/auth-verify', { wallet: address, signature, nonce, chain: 'ethereum' }), 15000, 'Verification')
      if (result.sessionToken) {
        LS.set('xs_session', result.sessionToken)
        setSessionToken(result.sessionToken)
      } else {
        throw new Error(result.error || 'Verification failed')
      }
    } catch (e) {
      setAuthErr(e.message || 'Signing failed. Please try again.')
    }
    setSigning(false)
  }, [address, signMessageAsync])

  // Reset auth state when wallet disconnects (sign-in is now manually triggered
  // via the "SIGN TO VERIFY WALLET" button below, not auto-fired, to avoid
  // re-triggering the MetaMask deep link on every page reload)
  useEffect(() => {
    if (!isConnected) {
      LS.del('xs_session')
      setSessionToken(null)
      setUser(null)
      setUsage(null)
      setReport(null)
    }
  }, [isConnected])

  // Load user + usage when session exists
  useEffect(() => {
    if (!address || !sessionToken) return
    api('/get-user', { wallet: address }).then(data => {
      if (data.wallet_address) setUser(data)
    })
    api('/usage', { wallet: address, sessionToken }).then(data => {
      if (data.tier) setUsage(data)
    })
  }, [address, sessionToken])

  const refreshUsage = async () => {
    if (!address || !sessionToken) return
    const data = await api('/usage', { wallet: address, sessionToken })
    if (data.tier) setUsage(data)
  }

  // ── SCAN ──────────────────────────────────────────────────────────
  const analyze = async () => {
    if (!addr.trim() || !sessionToken) return
    if (usage && usage.remaining <= 0 && user?.tier !== 'owner') { setModal('paywall'); return }
    setLoading(true); setErr(null); setReport(null); setDex(null)
    try {
      const data = await api('/scan', { wallet: address, sessionToken, address: addr.trim(), chain })
      if (data.error === 'SCAN_LIMIT_REACHED') { setModal('paywall'); setLoading(false); return }
      if (data.error === 'WALLET_UNVERIFIED') {
        setErr(`Wallet not eligible: ${data.message}`)
        setLoading(false); return
      }
      if (data.error === 'AUTH_REQUIRED') {
        setSessionToken(null); LS.del('xs_session')
        setErr('Session expired. Please sign in again.')
        setLoading(false); return
      }
      if (data.error) { setErr(data.error); setLoading(false); return }
      setReport(data)
      setDex(data._raw?.dex || null)
      await refreshUsage()
    } catch (e) {
      setErr('Analysis failed. Check the address and try again.')
    }
    setLoading(false)
  }

  // ── WATCHLIST ─────────────────────────────────────────────────────
  const addToWatchlist = async () => {
    if (!report || !sessionToken) return
    const result = await api('/watchlist/add', {
      wallet: address, sessionToken,
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
    const data = await api('/watchlist/list', { wallet: address, sessionToken })
    if (data.watchlist) setWatchlist(data.watchlist)
  }

  const removeFromWatchlist = async (tokenAddress, tokenChain) => {
    await api('/watchlist/remove', { wallet: address, sessionToken, address: tokenAddress, chain: tokenChain })
    loadWatchlist()
  }

  // ── HISTORY ───────────────────────────────────────────────────────
  const loadHistory = async (page = 1) => {
    if (!sessionToken) return
    const data = await api('/scan-history', { wallet: address, sessionToken, page, limit: 20 })
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
    const data = await api('/verify-payment', { wallet: address, sessionToken, txHash: txHash.trim(), tier: selTier })
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
    const data = await api('/use-code', { wallet: address, sessionToken, code: codeIn.trim() })
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

  const risk = report ? getRisk(report.riskScore) : null
  const cur  = TIERS[user?.tier] || TIERS.free

  // ── SPLASH ────────────────────────────────────────────────────────
  if (!isConnected || !sessionToken) return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:"'Courier New',Monaco,monospace", display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'32px 24px', textAlign:'center' }}>
      <div style={{ position:'relative', marginBottom:8 }}>
        <div style={{ position:'absolute', inset:-20, borderRadius:'50%', background:'radial-gradient(circle,rgba(0,194,255,0.12) 0%,transparent 65%)', filter:'blur(10px)' }}/>
        <div style={{ position:'relative', filter:'drop-shadow(0 0 20px rgba(0,194,255,0.55))' }}><Logo size={96}/></div>
      </div>
      <div style={{ fontSize:26, fontWeight:'bold', letterSpacing:7, marginTop:18, background:C.gradFull, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>XANDRSCAN</div>
      <div style={{ fontSize:10, color:C.textM, letterSpacing:4, marginTop:6 }}>AI TOKEN RISK INTELLIGENCE</div>
      <div style={{ width:60, height:1, background:C.grad, margin:'20px auto' }}/>
      <div style={{ maxWidth:280, fontSize:13, color:C.textM, lineHeight:2, marginBottom:32 }}>
        Scan any token. Detect rug patterns.<br/>
        <span style={{ color:C.text }}>Know the risk before you trade.</span>
      </div>

      {!isConnected ? (
        <button onClick={() => open()} style={{ width:'100%', maxWidth:320, padding:'15px', borderRadius:10, background:C.grad, color:'#fff', border:'none', cursor:'pointer', fontSize:12, fontWeight:'bold', letterSpacing:2, boxShadow:'0 0 28px rgba(0,194,255,0.3)', fontFamily:'inherit' }}>
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
      <div style={{ marginTop:28, fontSize:10, color:C.textD }}>Built by <span style={{ color:C.blue }}>LØRD XAND3R</span> · Web3 Intelligence</div>
    </div>
  )

  // ── MAIN APP ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:"'Courier New',Monaco,monospace" }}>

      {/* MODALS */}
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
        {[['scan','🔍 SCAN'],['history','📋 HISTORY'],['watchlist','⭐ WATCHLIST']].map(([v,l]) => (
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

                {/* RUG DNA */}
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
                    {report.rugDNA.similarTokens?.length > 0 && (
                      <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid rgba(168,85,247,0.12)' }}>
                        <FL style={{ color:C.purple, marginBottom:8 }}>SIMILAR TOKENS FROM DATABASE</FL>
                        {report.rugDNA.similarTokens.map((t,i) => (
                          <div key={i} style={{ background:C.bg, borderRadius:8, padding:10, marginBottom:6, border:'1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                              <span style={{ fontSize:12, color:C.text, fontWeight:'bold' }}>{t.name} ({t.symbol})</span>
                              <span style={{ fontSize:11, color:C.purple }}>{t.similarityScore}% match</span>
                            </div>
                            <div style={{ fontSize:10, color:C.textD }}>{(t.sharedFlags||[]).join(' · ')}</div>
                          </div>
                        ))}
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
                    {report.holderAnalysis.creatorAddress && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:9, color:C.textD, marginBottom:3 }}>CREATOR</div>
                        <div style={{ fontSize:10, color:C.textM }}>{report.holderAnalysis.creatorAddress.slice(0,12)}... holds {report.holderAnalysis.creatorPercent?.toFixed(2)}%</div>
                      </div>
                    )}
                    {(report.holderAnalysis.topHolders||[]).slice(0,5).map((h,i) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid rgba(255,255,255,0.04)', paddingBottom:6, marginBottom:6 }}>
                        <div style={{ fontSize:10, color:C.textD }}>{i+1}. {h.tag || (h.address||'').slice(0,10)}...</div>
                        <div style={{ fontSize:10, color:C.textM }}>{h.percent || h.pct}%{h.isLocked?' 🔒':''}</div>
                      </div>
                    ))}
                  </Surf>
                )}

                {/* ACTIONS */}
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={shareReport} style={{ flex:1, padding:13, borderRadius:10, background:copied?'rgba(0,229,160,0.08)':C.surfaceB, border:copied?'1px solid rgba(0,229,160,0.3)':'1px solid rgba(255,255,255,0.06)', color:copied?C.success:C.textM, cursor:'pointer', fontSize:10, letterSpacing:1.5, fontFamily:'inherit' }}>
                    {copied ? '✓ COPIED' : '📤 SHARE'}
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
                  Confidence: {report.dataConfidence?.toUpperCase()} · Not financial advice.
                </div>
              </div>
            )}
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
function PBtn({ children, onClick, disabled }) { return <button onClick={onClick} disabled={disabled} style={{ width:'100%', padding:13, borderRadius:9, background:disabled?'#111827':'linear-gradient(135deg,#00C2FF,#A855F7)', color:disabled?'#4A5568':'#fff', border:'none', cursor:disabled?'not-allowed':'pointer', fontSize:11, fontWeight:'bold', letterSpacing:2, fontFamily:'inherit', marginTop:12 }}>{children}</button> }
function GBtn({ children, onClick })  { return <button onClick={onClick} style={{ width:'100%', padding:10, borderRadius:9, background:'transparent', color:'#94A3B8', border:'1px solid rgba(255,255,255,0.07)', cursor:'pointer', fontSize:11, fontFamily:'inherit', marginTop:8 }}>{children}</button> }
function Overlay({ children })        { return <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20, backdropFilter:'blur(6px)' }}><div style={{ background:'#0E1420', border:'1px solid rgba(0,194,255,0.18)', borderRadius:16, padding:'24px 20px', maxWidth:400, width:'100%', maxHeight:'90vh', overflowY:'auto' }}>{children}</div></div> }
function MT({ children })             { return <div style={{ fontSize:15, fontWeight:'bold', color:'#F0F4FF', marginBottom:5, textAlign:'center', letterSpacing:1 }}>{children}</div> }
function MS({ children })             { return <div style={{ fontSize:12, color:'#94A3B8', marginBottom:18, textAlign:'center', lineHeight:1.7 }}>{children}</div> }
function HC({ children, onClick, c }) { return <button onClick={onClick} style={{ fontSize:9, padding:'3px 9px', border:`1px solid ${c}22`, borderRadius:20, color:c, background:`${c}09`, cursor:'pointer', fontFamily:'inherit', letterSpacing:1.5 }}>{children}</button> }
