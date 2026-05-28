import { useState, useEffect } from 'react'
import { useAppKit, useAppKitAccount } from '@reown/appkit/react'

const WORKER = 'https://xandrscan-api.noreply-xandrscan.workers.dev'
const OWNER_WALLET = '0x8676CD2adbf0A3C2676d2c9e1cc9252845C74839'
const TIERS = {
  free:    { label:'FREE',    scans:2,      price:'$0',     eth:0,     color:'#64748b' },
  starter: { label:'STARTER', scans:12,     price:'$5/mo',  eth:0.002, color:'#00C2FF' },
  pro:     { label:'PRO',     scans:30,     price:'$10/mo', eth:0.004, color:'#A855F7' },
  alpha:   { label:'ALPHA',   scans:150,    price:'$50/mo', eth:0.018, color:'#F59E0B' },
  owner:   { label:'OWNER',   scans:999999, price:'∞',      eth:0,     color:'#F59E0B' },
}
const CHAINS = [
  { id:'solana', label:'Solana' },
  { id:'ethereum', label:'Ethereum' },
  { id:'base', label:'Base' },
  { id:'bsc', label:'BSC' },
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
  if (s<=35) return { color:C.success, label:'LOW RISK', bg:'rgba(0,229,160,0.07)', glow:'rgba(0,229,160,0.2)' }
  if (s<=65) return { color:C.gold, label:'MODERATE RISK', bg:'rgba(245,158,11,0.07)', glow:'rgba(245,158,11,0.2)' }
  return { color:C.danger, label:'HIGH RISK', bg:'rgba(255,69,96,0.07)', glow:'rgba(255,69,96,0.2)' }
}
const fmt = n => Number(n||0).toLocaleString()
const shortW = w => w ? `${w.slice(0,6)}...${w.slice(-4)}` : ''
const api = async (path, body) => {
  const r = await fetch(`${WORKER}${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
  return r.json()
}
function Logo({ size=40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <defs>
        <linearGradient id="lgM" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C0EEFF"/>
          <stop offset="18%" stopColor="#3DD4FF"/>
          <stop offset="45%" stopColor="#0099EE"/>
          <stop offset="78%" stopColor="#0055AA"/>
          <stop offset="100%" stopColor="#002060"/>
        </linearGradient>
        <linearGradient id="lgS" x1="0%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#D8F5FF"/>
          <stop offset="20%" stopColor="#55DDFF"/>
          <stop offset="48%" stopColor="#00AAFF"/>
          <stop offset="80%" stopColor="#0066BB"/>
          <stop offset="100%" stopColor="#002877"/>
        </linearGradient>
        <linearGradient id="lgSh" x1="0%" y1="0%" x2="30%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6"/>
          <stop offset="28%" stopColor="#FFFFFF" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="15,15 4,26 174,196 185,185 196,174 26,4" fill="rgba(0,0,12,0.8)"/>
      <polygon points="185,15 196,26 26,196 15,185 4,174 174,4" fill="rgba(0,0,12,0.8)"/>
      <polygon points="15,15 4,26 174,196 185,185 196,174 26,4" fill="url(#lgM)"/>
      <polygon points="15,15 4,26 174,196 185,185 196,174 26,4" fill="url(#lgSh)"/>
      <polygon points="185,15 196,26 26,196 15,185 4,174 174,4" fill="url(#lgM)"/>
      <polygon points="185,15 196,26 26,196 15,185 4,174 174,4" fill="url(#lgSh)"/>
      <path d="M 150,32 C 150,32 74,26 54,66 C 34,106 106,118 124,140 C 142,162 134,184 58,190" stroke="#003888" strokeWidth="50" strokeLinecap="round" fill="none"/>
      <path d="M 150,32 C 150,32 74,26 54,66 C 34,106 106,118 124,140 C 142,162 134,184 58,190" stroke="url(#lgS)" strokeWidth="46" strokeLinecap="round" fill="none"/>
      <path d="M 150,32 C 150,32 74,26 54,66 C 34,106 106,118 124,140 C 142,162 134,184 58,190" stroke="url(#lgSh)" strokeWidth="46" strokeLinecap="round" fill="none"/>
      <path d="M 149,33 C 149,33 76,27 57,66 C 38,105 108,118 125,140" stroke="#B8F0FF" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.9"/>
    </svg>
  )
}
export default function App() {
  const { open } = useAppKit()
  const { address, isConnected } = useAppKitAccount()
  const [user,setUser] = useState(null)
  const [addr,setAddr] = useState('')
  const [chain,setChain] = useState('ethereum')
  const [loading,setLoading] = useState(false)
  const [report,setReport] = useState(null)
  const [dex,setDex] = useState(null)
  const [err,setErr] = useState(null)
  const [copied,setCopied] = useState(false)
  const [modal,setModal] = useState(null)
  const [selTier,setSelTier] = useState(null)
  const [txHash,setTxHash] = useState('')
  const [vfying,setVfying] = useState(false)
  const [vfMsg,setVfMsg] = useState({text:'',ok:false})
  const [codeIn,setCodeIn] = useState('')
  const [codeMsg,setCodeMsg] = useState({text:'',ok:false})
  useEffect(() => {
    if (isConnected && address) {
      api('/get-user',{wallet:address}).then(data => { if(data.wallet_address) setUser(data) })
    } else { setUser(null); setReport(null); setDex(null) }
  }, [isConnected,address])
  const refreshUser = async () => {
    if (!address) return
    const data = await api('/get-user',{wallet:address})
    if (data.wallet_address) setUser(data)
  }
  const redeemCode = async () => {
    const data = await api('/use-code',{wallet:address,code:codeIn.trim()})
    if (data.success) {
      setCodeMsg({text:'👑 OWNER MODE UNLOCKED.',ok:true})
      await refreshUser()
      setTimeout(()=>{setModal(null);setCodeMsg({text:'',ok:false});setCodeIn('')},2200)
    } else { setCodeMsg({text:data.error==='INVALID_CODE'?'Invalid code.':'Error.',ok:false}) }
  }
  const verifyPayment = async () => {
    if (!txHash.trim()||!selTier) return
    setVfying(true); setVfMsg({text:'',ok:false})
    const data = await api('/verify-payment',{wallet:address,txHash:txHash.trim(),tier:selTier})
    if (data.success) {
      setVfMsg({text:`✅ ${TIERS[selTier].label} unlocked!`,ok:true})
      await refreshUser()
      setTimeout(()=>{setModal(null);setVfMsg({text:'',ok:false});setTxHash('')},3000)
    } else {
      const msgs = {TX_ALREADY_USED:'❌ Already used.',TX_NOT_FOUND:'❌ Not found.',TX_PENDING:'⏳ Still pending.',WRONG_WALLET:'❌ Wrong wallet.',UNDERPAID:`❌ Need ${TIERS[selTier]?.eth} ETH.`}
      setVfMsg({text:msgs[data.error]||'❌ Failed.',ok:false})
    }
    setVfying(false)
  }
  const fetchDex = async (address, chainId) => {
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`)
      const j = await r.json()
      if (j.pairs?.length > 0) {
        const p = j.pairs.find(x => x.chainId === chainId) || j.pairs[0]
        return { name:p.baseToken?.name||'Unknown', symbol:p.baseToken?.symbol||'???', price:p.priceUsd||'0', liquidity:p.liquidity?.usd||0, volume24h:p.volume?.h24||0, priceChange24h:p.priceChange?.h24||0, buys24h:p.txns?.h24?.buys||0, sells24h:p.txns?.h24?.sells||0, marketCap:p.marketCap||0, fdv:p.fdv||0, dex:p.dexId||'Unknown', chain:p.chainId||chainId, age:p.pairCreatedAt?Math.floor((Date.now()-p.pairCreatedAt)/86400000):null }
      }
      return null
    } catch { return null }
  }
  const cur = TIERS[user?.tier]||TIERS.free
  const left = user?.tier==='owner'?'∞':Math.max(0,cur.scans-(user?.scans_used||0))
  const locked = user?.tier!=='owner'&&typeof left==='number'&&left<=0
  const analyze = async () => {
    if (!addr.trim()) return
    if (locked) { setModal('paywall'); return }
    setLoading(true); setErr(null); setReport(null); setDex(null)
    try {
      const td = await fetchDex(addr.trim(),chain)
      setDex(td)
      const ctx = td ? `LIVE DATA: ${td.name}(${td.symbol}) | Chain:${td.chain} | Price:$${td.price} | Liq:$${fmt(td.liquidity)} | Vol24h:$${fmt(td.volume24h)} | Change:${td.priceChange24h}% | Buys:${td.buys24h} Sells:${td.sells24h} | MCap:$${fmt(td.marketCap)} | FDV:$${fmt(td.fdv)} | DEX:${td.dex} | Age:${td.age??'?'}d` : 'No live data.'
      const prompt = `You are XANDRSCAN — elite memecoin risk analyst for retail traders in emerging markets.\n${ctx}\nCONTRACT: ${addr} | CHAIN: ${chain.toUpperCase()}\nReturn ONLY valid JSON:\n{"tokenName":"string","symbol":"string","riskScore":number,"verdict":"one sentence","redFlags":["max 5"],"greenLights":["max 4"],"keyMetrics":{"liquidity":"value+context","holderConcentration":"estimate","devActivity":"inference","sniperRisk":"low/med/high+reason"},"rugDNA":{"matchScore":number,"patterns":["3-5 patterns"],"historicalVerdict":"1-2 sentences","timeRisk":"risk window"},"plainEnglishSummary":"3-4 sentences no jargon","actionableAdvice":"1-2 sentences","dataConfidence":"high|medium|low"}\nScoring: 0-35 low, 36-65 moderate, 66-100 high.`
      const data = await api('/scan',{wallet:address,prompt})
      if (data.error==='SCAN_LIMIT_REACHED') { setModal('paywall'); setLoading(false); return }
      const text = data.content?.find(b=>b.type==='text')?.text||''
      const parsed = JSON.parse(text.replace(/```json|```/g,'').trim())
      setReport(parsed)
      await refreshUser()
    } catch(e) { setErr('Analysis failed. Check the address and try again.') }
    setLoading(false)
  }
  const shareReport = () => {
    if (!report) return
    const rsk = getRisk(report.riskScore)
    const txt = `XANDRSCAN REPORT\nToken: ${report.tokenName} (${report.symbol})\nRisk: ${report.riskScore}/100 - ${rsk.label}\n\n${report.verdict}\n\nRed Flags:\n${report.redFlags.map(f=>`- ${f}`).join('\n')}\n\nGreen Lights:\n${report.greenLights.map(g=>`- ${g}`).join('\n')}\n\nRug DNA: ${report.rugDNA?.matchScore}/100\n\n${report.actionableAdvice}\n\nScanned by XANDRSCAN - Not financial advice.`
    navigator.clipboard.writeText(txt).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500)})
  }
  const risk = report ? getRisk(report.riskScore) : null
  if (!isConnected) return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:"'Courier New',Monaco,monospace",display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 24px',textAlign:'center'}}>
      <Logo size={96}/>
      <div style={{fontSize:26,fontWeight:'bold',letterSpacing:7,marginTop:18,background:C.gradFull,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>XANDRSCAN</div>
      <div style={{fontSize:10,color:C.textM,letterSpacing:4,marginTop:6}}>AI TOKEN RISK INTELLIGENCE</div>
      <div style={{width:60,height:1,background:C.grad,margin:'20px auto'}}/>
      <div style={{maxWidth:280,fontSize:13,color:C.textM,lineHeight:2,marginBottom:32}}>Scan any token. Detect rug patterns.<br/><span style={{color:C.text}}>Know the risk before you trade.</span></div>
      <button onClick={()=>open()} style={{width:'100%',maxWidth:320,padding:'15px',borderRadius:10,background:C.grad,color:'#fff',border:'none',cursor:'pointer',fontSize:12,fontWeight:'bold',letterSpacing:2,boxShadow:'0 0 28px rgba(0,194,255,0.3)'}}>🔗  CONNECT WALLET</button>
      <div style={{marginTop:24,fontSize:10,color:C.textD}}>Built by <span style={{color:C.blue}}>LØRD XAND3R</span> · Web3 Intelligence</div>
    </div>
  )
  return (
    <div style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:"'Courier New',Monaco,monospace"}}>
      {modal==='paywall'&&(<Overlay><div style={{display:'flex',justifyContent:'center',marginBottom:10}}><Logo size={40}/></div><MT>Free Scans Used Up</MT><MS>Choose a plan. Pay via ETH on Base.</MS>{['starter','pro','alpha'].map(t=>(<div key={t} onClick={()=>{setSelTier(t);setModal('pay')}} style={{border:`1px solid ${TIERS[t].color}28`,borderRadius:10,padding:'13px 15px',marginBottom:9,display:'flex',justifyContent:'space-between',alignItems:'center',background:`${TIERS[t].color}08`,cursor:'pointer'}}><div><div style={{fontSize:12,color:TIERS[t].color,fontWeight:'bold'}}>{TIERS[t].label}</div><div style={{fontSize:11,color:C.textM,marginTop:3}}>{TIERS[t].scans} scans/month</div></div><div style={{fontSize:14,color:C.text,fontWeight:'bold'}}>{TIERS[t].price}</div></div>))}<PBtn onClick={()=>setModal('code')}>I HAVE A CODE →</PBtn><GBtn onClick={()=>setModal(null)}>Cancel</GBtn></Overlay>)}
      {modal==='pay'&&selTier&&(<Overlay><MT>{TIERS[selTier].label} — Send Payment</MT><Surf style={{marginBottom:12}}><FL>SEND EXACTLY</FL><div style={{fontSize:26,color:TIERS[selTier].color,fontWeight:'bold'}}>{TIERS[selTier].eth} ETH</div><div style={{fontSize:11,color:C.textM}}>≈ {TIERS[selTier].price} · Base Network only</div></Surf><Surf style={{marginBottom:12}}><FL>TO THIS WALLET</FL><div style={{fontSize:10,color:C.text,wordBreak:'break-all',lineHeight:1.9}}>{OWNER_WALLET}</div></Surf><div style={{fontSize:11,color:C.gold,textAlign:'center',marginBottom:14,padding:10,background:'rgba(245,158,11,0.05)',borderRadius:8}}>⚠️ Base network only · Wrong network = lost funds</div><PBtn onClick={()=>setModal('verify')}>I'VE SENT PAYMENT →</PBtn><GBtn onClick={()=>setModal('paywall')}>← Back</GBtn></Overlay>)}
      {modal==='verify'&&(<Overlay><MT>Verify Payment</MT><MS>Paste your Base transaction hash.</MS><AI value={txHash} onChange={e=>setTxHash(e.target.value)} placeholder="0x..." style={{marginBottom:10}}/>{vfMsg.text&&<div style={{fontSize:12,color:vfMsg.ok?C.success:C.danger,marginBottom:10}}>{vfMsg.text}</div>}<PBtn onClick={verifyPayment} disabled={vfying}>{vfying?'⟳ VERIFYING...':'✓ VERIFY PAYMENT'}</PBtn><GBtn onClick={()=>setModal('pay')}>← Back</GBtn></Overlay>)}
      {modal==='code'&&(<Overlay><MT>Enter Access Code</MT><MS>Owner or premium code.</MS><AI value={codeIn} onChange={e=>setCodeIn(e.target.value)} placeholder="XANDR-XXXX-XXXX" style={{letterSpacing:2,marginBottom:8}}/>{codeMsg.text&&<div style={{fontSize:12,color:codeMsg.ok?C.success:C.danger,marginBottom:10}}>{codeMsg.text}</div>}<PBtn onClick={redeemCode}>UNLOCK ACCESS</PBtn><GBtn onClick={()=>setModal(null)}>Cancel</GBtn></Overlay>)}
      <div style={{borderBottom:'1px solid rgba(0,194,255,0.1)',padding:'12px 18px',display:'flex',alignItems:'center',gap:10,background:'rgba(8,9,13,0.96)',backdropFilter:'blur(16px)',position:'sticky',top:0,zIndex:10}}>
        <Logo size={26}/>
        <div><div style={{fontSize:11,fontWeight:'bold',letterSpacing:3,background:C.grad,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>XANDRSCAN</div><div style={{fontSize:8,color:C.textD,letterSpacing:2}}>AI RISK INTELLIGENCE</div></div>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          <div style={{fontSize:9,padding:'3px 10px',border:`1px solid ${cur.color}28`,borderRadius:20,color:cur.color,background:`${cur.color}0d`}}>{user?.tier==='owner'?'👑 OWNER':cur.label}</div>
          <div style={{fontSize:9,color:C.textD}}>{left}{typeof left==='number'?' left':''}</div>
          <div style={{fontSize:9,color:C.textD,padding:'2px 8px',border:'1px solid rgba(255,255,255,0.06)',borderRadius:20}}>{shortW(address)}</div>
          {user?.tier==='free'&&<HC onClick={()=>setModal('paywall')} c={C.blue}>UPGRADE</HC>}
          <HC onClick={()=>setModal('code')} c={C.purple}>CODE</HC>
          <HC onClick={()=>open()} c={C.textD}>WALLET</HC>
        </div>
      </div>
      <div style={{padding:16,maxWidth:580,margin:'0 auto'}}>
        {typeof left==='number'&&left===1&&(<div style={{background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:9,padding:'9px 14px',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:11,color:C.gold}}>⚠️ Last free scan</span><HC onClick={()=>setModal('paywall')} c={C.gold}>UPGRADE</HC></div>)}
        <Surf style={{marginBottom:14}}>
          <FL>CONTRACT ADDRESS</FL>
          <AI value={addr} onChange={e=>setAddr(e.target.value)} placeholder="Paste token address..." onKeyDown={e=>e.key==='Enter'&&analyze()} style={{marginBottom:11}}/>
          <FL>CHAIN</FL>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:13}}>{CHAINS.map(c=>(<button key={c.id} onClick={()=>setChain(c.id)} style={{padding:'6px 13px',borderRadius:7,cursor:'pointer',fontSize:10,letterSpacing:1.5,fontFamily:'inherit',border:chain===c.id?`1px solid ${C.blue}`:'1px solid rgba(255,255,255,0.06)',background:chain===c.id?'rgba(0,194,255,0.1)':C.surfaceB,color:chain===c.id?C.blue:C.textD}}>{c.label}</button>))}</div>
          <button onClick={analyze} disabled={loading||!addr.trim()} style={{width:'100%',padding:13,borderRadius:9,background:locked||loading?C.surfaceB:C.grad,color:locked||loading?C.textD:'#fff',border:locked||loading?'1px solid rgba(255,255,255,0.05)':'none',cursor:locked||loading?'not-allowed':'pointer',fontSize:11,fontWeight:'bold',letterSpacing:2.5,fontFamily:'inherit',boxShadow:!locked&&!loading?'0 0 24px rgba(0,194,255,0.22)':'none'}}>
            {loading?'⟳  SCANNING...':locked?'🔒  UPGRADE TO SCAN':`⚡  ANALYZE TOKEN  (${left} scan${left!==1&&left!=='∞'?'s':''} left)`}
          </button>
        </Surf>
        {loading&&(<div style={{textAlign:'center',padding:28,color:C.textD,fontSize:10,letterSpacing:2}}><div style={{color:C.blue,fontSize:22,marginBottom:8}}>⟳</div>FETCHING ON-CHAIN DATA<br/><span style={{fontSize:9}}>RUNNING RUG DNA ANALYSIS</span></div>)}
        {err&&<div style={{background:'rgba(255,69,96,0.07)',border:'1px solid rgba(255,69,96,0.22)',borderRadius:9,padding:13,color:C.danger,fontSize:12}}>{err}</div>}
        {report&&risk&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{background:risk.bg,border:`1px solid ${risk.color}22`,borderRadius:13,padding:20,textAlign:'center',boxShadow:`0 0 40px ${risk.glow}`}}>
              <div style={{fontSize:9,color:C.textM,letterSpacing:3,marginBottom:5}}>RISK SCORE</div>
              <div style={{fontSize:56,fontWeight:'bold',color:risk.color,lineHeight:1,textShadow:`0 0 30px ${risk.color}55`}}>{report.riskScore}</div>
              <div style={{fontSize:10,color:risk.color,letterSpacing:4,marginTop:5}}>{risk.label}</div>
              <div style={{fontSize:13,color:C.textM,marginTop:10,fontStyle:'italic',lineHeight:1.6}}>"{report.verdict}"</div>
            </div>
            {dex&&(<Surf><FL>LIVE MARKET DATA</FL><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>{[['Price',`$${Number(dex.price||0).toFixed(8)}`],['Liquidity',`$${fmt(dex.liquidity)}`],['24h Volume',`$${fmt(dex.volume24h)}`],['24h Change',`${dex.priceChange24h>0?'+':''}${dex.priceChange24h}%`],['Buys/Sells',`${dex.buys24h}/${dex.sells24h}`],['Market Cap',`$${fmt(dex.marketCap)}`]].map(([l,v])=>(<div key={l} style={{background:C.bg,borderRadius:8,padding:10,border:'1px solid rgba(255,255,255,0.04)'}}><div style={{fontSize:8,color:C.textD,marginBottom:3}}>{l}</div><div style={{fontSize:12,color:C.text,fontWeight:'bold'}}>{v}</div></div>))}</div></Surf>)}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
              <div style={{background:'rgba(255,69,96,0.05)',border:'1px solid rgba(255,69,96,0.15)',borderRadius:11,padding:13}}><FL style={{color:C.danger}}>🚩 RED FLAGS</FL>{report.redFlags.map((f,i)=><div key={i} style={{fontSize:11,color:C.textM,marginBottom:6,lineHeight:1.6}}>• {f}</div>)}</div>
              <div style={{background:'rgba(0,229,160,0.05)',border:'1px solid rgba(0,229,160,0.15)',borderRadius:11,padding:13}}><FL style={{color:C.success}}>✅ GREEN</FL>{report.greenLights.map((g,i)=><div key={i} style={{fontSize:11,color:C.textM,marginBottom:6,lineHeight:1.6}}>• {g}</div>)}</div>
            </div>
            {report.rugDNA&&(<div style={{background:'rgba(168,85,247,0.05)',border:'1px solid rgba(168,85,247,0.2)',borderRadius:11,padding:13}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><FL style={{color:C.purple,marginBottom:0}}>🧬 RUG DNA</FL><div style={{fontSize:13,color:report.rugDNA.matchScore>65?C.danger:report.rugDNA.matchScore>35?C.gold:C.success,fontWeight:'bold'}}>{report.rugDNA.matchScore}<span style={{fontSize:9,color:C.textD}}>/100</span></div></div>{report.rugDNA.patterns?.map((p,i)=><div key={i} style={{fontSize:11,color:C.textM,marginBottom:6,lineHeight:1.6}}>• {p}</div>)}<div style={{marginTop:10,paddingTop:10,borderTop:'1px solid rgba(168,85,247,0.12)',fontSize:11,color:C.textD,lineHeight:1.75,fontStyle:'italic'}}>{report.rugDNA.historicalVerdict}</div>{report.rugDNA.timeRisk&&<div style={{marginTop:7,fontSize:10,color:C.purple}}>⏱ {report.rugDNA.timeRisk}</div>}</div>)}
            <Surf><FL>📋 PLAIN ENGLISH</FL><div style={{fontSize:13,color:C.text,lineHeight:1.9}}>{report.plainEnglishSummary}</div></Surf>
            <div style={{background:risk.bg,border:`1px solid ${risk.color}18`,borderRadius:11,padding:13}}><FL style={{color:risk.color}}>⚡ WHAT TO DO</FL><div style={{fontSize:13,color:C.text,lineHeight:1.8,fontWeight:500}}>{report.actionableAdvice}</div></div>
            <Surf><FL>🔍 KEY METRICS</FL>{Object.entries(report.keyMetrics).map(([k,v])=>(<div key={k} style={{display:'flex',justifyContent:'space-between',borderBottom:'1px solid rgba(255,255,255,0.04)',paddingBottom:7,marginBottom:7,gap:10}}><div style={{fontSize:9,color:C.textD,letterSpacing:1.5,minWidth:108,textTransform:'uppercase'}}>{k.replace(/([A-Z])/g,' $1')}</div><div style={{fontSize:11,color:C.textM,textAlign:'right',lineHeight:1.6}}>{v}</div></div>))}</Surf>
            <button onClick={shareReport} style={{width:'100%',padding:13,borderRadius:10,background:copied?'rgba(0,229,160,0.08)':C.surfaceB,border:copied?'1px solid rgba(0,229,160,0.3)':'1px solid rgba(255,255,255,0.06)',color:copied?C.success:C.textM,cursor:'pointer',fontSize:11,letterSpacing:2,fontFamily:'inherit'}}>{copied?'✓ COPIED — PASTE IN TELEGRAM/X':'📤 SHARE THIS REPORT'}</button>
            {user?.tier==='free'&&(<div style={{background:'rgba(0,194,255,0.04)',border:'1px solid rgba(0,194,255,0.15)',borderRadius:11,padding:15,textAlign:'center'}}><div style={{fontSize:12,color:C.blue,letterSpacing:2,marginBottom:4}}>WANT MORE SCANS?</div><div style={{fontSize:12,color:C.textM,marginBottom:12}}>Unlimited · Rug DNA · Priority analysis</div><button onClick={()=>setModal('paywall')} style={{padding:'10px 26px',borderRadius:8,background:C.grad,color:'#fff',border:'none',cursor:'pointer',fontSize:10,fontWeight:'bold',letterSpacing:2,fontFamily:'inherit'}}>UPGRADE NOW</button></div>)}
            <div style={{fontSize:9,color:C.textD,textAlign:'center',lineHeight:1.9,padding:8}}>Confidence: {report.dataConfidence?.toUpperCase()} · Not financial advice.</div>
          </div>
        )}
      </div>
    </div>
  )
}
function Surf({children,style={}}){return <div style={{background:'#0E1420',border:'1px solid rgba(255,255,255,0.05)',borderRadius:11,padding:13,...style}}>{children}</div>}
function FL({children,style={}}){return <div style={{fontSize:9,color:'#4A5568',letterSpacing:2.5,marginBottom:8,textAlign:'left',...style}}>{children}</div>}
function AI({style={},...props}){return <input {...props} style={{width:'100%',background:'#08090D',border:'1px solid rgba(0,194,255,0.18)',borderRadius:8,padding:'12px 14px',color:'#F0F4FF',fontFamily:'inherit',fontSize:13,outline:'none',boxSizing:'border-box',marginBottom:3,...style}}/>}
function PBtn({children,onClick,disabled}){return <button onClick={onClick} disabled={disabled} style={{width:'100%',padding:13,borderRadius:9,background:disabled?'#111827':'linear-gradient(135deg,#00C2FF,#A855F7)',color:disabled?'#4A5568':'#fff',border:'none',cursor:disabled?'not-allowed':'pointer',fontSize:11,fontWeight:'bold',letterSpacing:2,fontFamily:'inherit',marginTop:12,boxShadow:!disabled?'0 0 20px rgba(0,194,255,0.18)':'none'}}>{children}</button>}
function GBtn({children,onClick}){return <button onClick={onClick} style={{width:'100%',padding:10,borderRadius:9,background:'transparent',color:'#94A3B8',border:'1px solid rgba(255,255,255,0.07)',cursor:'pointer',fontSize:11,fontFamily:'inherit',marginTop:8}}>{children}</button>}
function Overlay({children}){return(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20,backdropFilter:'blur(6px)'}}><div style={{background:'#0E1420',border:'1px solid rgba(0,194,255,0.18)',borderRadius:16,padding:'24px 20px',maxWidth:400,width:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 0 60px rgba(0,194,255,0.1)'}}>{children}</div></div>)}
function MT({children}){return <div style={{fontSize:15,fontWeight:'bold',color:'#F0F4FF',marginBottom:5,textAlign:'center',letterSpacing:1}}>{children}</div>}
function MS({children}){return <div style={{fontSize:12,color:'#94A3B8',marginBottom:18,textAlign:'center',lineHeight:1.7}}>{children}</div>}
function HC({children,onClick,c}){return <button onClick={onClick} style={{fontSize:9,padding:'3px 9px',border:`1px solid ${c}22`,borderRadius:20,color:c,background:`${c}09`,cursor:'pointer',fontFamily:'inherit',letterSpacing:1.5}}>{children}</button>}
