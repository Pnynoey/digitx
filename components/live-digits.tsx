'use client';

/**
 * Institutional Quant Digits AI Engine - With Visual Barrier Selector
 */

import { useEffect, useState, useRef } from 'react';
import { useDigitsTrading } from '../hooks/use-digits-trading';
import { useDerivWSContext } from '@/components/custom/deriv-ws-provider';
import { useLogoSrc } from '@/components/custom/logo-src-provider';
import { DigitsView } from './digits-view';
import type { DigitsAppConfig } from '../lib/app-config';

export function LiveDigits({
  appConfig,
  editMode,
  onSelect,
  selectedKey,
  rearrangeMode,
  onReorder,
  logoSrc: logoSrcOverride,
  appName,
}: {
  appConfig?: DigitsAppConfig;
  editMode?: boolean;
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
  rearrangeMode?: boolean;
  onReorder?: (order: DigitsAppConfig['order']) => void;
  logoSrc?: string;
  appName?: string;
}) {
  const providerLogo = useLogoSrc();
  const logoSrc = logoSrcOverride ?? providerLogo;
  const { ws, isConnected, isExhausted, auth } = useDerivWSContext();
  const { authState, accounts, activeAccount, login, signUp, logout, switchAccount } = auth;

  const trading = useDigitsTrading({
    ws,
    isConnected,
    isExhausted,
    isAuthenticated: !!auth.wsUrl,
    onAuthWSFailed: logout,
  });

  // ------------------------------------------------------------------
  // 🚀 ADVANCED AUTO ENGINE STATE
  // ------------------------------------------------------------------
  const [isAuto, setIsAuto] = useState<boolean>(false);
  const [botStrategy, setBotStrategy] = useState<'OU_QUANT' | 'DIFF_CLUSTER' | 'EVEN_ODD'>('OU_QUANT');
  
  // 🎯 เพิ่มตัวแปรให้ผู้ใช้เลือก Barrier เลข Over / Under / Differ ได้เองตามใจชอบ
  const [overBarrier, setOverBarrier] = useState<number>(2);   // ค่าเริ่มต้น Over 2 (ชนะ 3-9)
  const [underBarrier, setUnderBarrier] = useState<number>(7); // ค่าเริ่มต้น Under 7 (ชนะ 0-6)
  
  const [isTradingLock, setIsTradingLock] = useState<boolean>(false);
  const [lastSignalLog, setLastSignalLog] = useState<string>('พร้อมรันระบบ...');
  const tickHistoryRef = useRef<number[]>([]);

  // 1. WebSocket Main Execution Loop
  useEffect(() => {
    if (trading.lastDigit !== undefined && trading.lastDigit !== null) {
      const history = tickHistoryRef.current;
      history.push(trading.lastDigit);
      if (history.length > 15) history.shift();

      if (isAuto && !isTradingLock && !trading.isBuying && history.length >= 5) {
        
        // ===========================================================
        // 🧠 STRATEGY 1: OVER / UNDER (Fast Signal Mode)
        // ===========================================================
        if (botStrategy === 'OU_QUANT') {
          const sample = history.slice(-5);
          const lastDigit = sample[sample.length - 1];
          const lowDigitsCount = sample.filter(d => d <= 3).length;
          const highDigitsCount = sample.filter(d => d >= 6).length;

          // 🎯 ยิง OVER ตามเลข Barrier ที่ตั้งไว้
          if (lowDigitsCount >= 3 && lastDigit >= 2) {
            triggerTrade('DIGITOVER', overBarrier, `🔥 OVER ${overBarrier} Trigger (Low Cluster: ${lowDigitsCount}/5)`);
          } 
          // 🎯 ยิง UNDER ตามเลข Barrier ที่ตั้งไว้
          else if (highDigitsCount >= 3 && lastDigit <= 7) {
            triggerTrade('DIGITUNDER', underBarrier, `⚡ UNDER ${underBarrier} Trigger (High Cluster: ${highDigitsCount}/5)`);
          }
        } 

        // ===========================================================
        // 🧠 STRATEGY 2: DIFFER (Cluster Anti-Siphon)
        // ===========================================================
        else if (botStrategy === 'DIFF_CLUSTER' && history.length >= 4) {
          const len = history.length;
          const d1 = history[len - 1];
          const d2 = history[len - 2];
          const d3 = history[len - 3];

          if (d3 === d2 && d1 !== d2) {
            triggerTrade('DIGITDIFF', d2, `🎯 Differ Trigger (Avoid Digit: ${d2})`);
          }
        }

        // ===========================================================
        // 🧠 STRATEGY 3: EVEN / ODD (Fast Reversion)
        // ===========================================================
        else if (botStrategy === 'EVEN_ODD' && history.length >= 6) {
          const sample = history.slice(-6);
          const evenCount = sample.filter(d => d % 2 === 0).length;
          const oddCount = 6 - evenCount;

          if (evenCount >= 4) {
            triggerTrade('DIGITODD', 0, `⚖️ EVEN/ODD: Bet ODD (Even Out: ${evenCount}/6)`);
          } else if (oddCount >= 4) {
            triggerTrade('DIGITEVEN', 0, `⚖️ EVEN/ODD: Bet EVEN (Odd Out: ${oddCount}/6)`);
          }
        }
      }
    }
  }, [trading.lastDigit, isAuto, isTradingLock, trading.isBuying, botStrategy, overBarrier, underBarrier]);

  // ฟังก์ชันยิงออเดอร์
  const triggerTrade = (tradeType: string, barrier: number, logMsg: string) => {
    setIsTradingLock(true);
    setLastSignalLog(logMsg);
    console.log(`[QUANT AI] ${logMsg}`);

    try {
      if (trading.setSelectedDigit) trading.setSelectedDigit(barrier);
      if (trading.setTradeType) (trading.setTradeType as any)(tradeType);
      if (trading.setContractMode) {
        let mode = 'OVER_UNDER';
        if (tradeType === 'DIGITDIFF') mode = 'MATCHES_DIFF';
        if (tradeType === 'DIGITEVEN' || tradeType === 'DIGITODD') mode = 'EVEN_ODD';
        (trading.setContractMode as any)(mode);
      }
    } catch (e) {
      console.error('Mode Execution Error:', e);
    }

    setTimeout(() => {
      trading.buyContract();
    }, 300);
  };

  // ปลดล็อกระบบเมื่อเทรดจบตา
  useEffect(() => {
    if (trading.buyResult || trading.buyError) {
      const timer = setTimeout(() => {
        trading.clearBuyResult();
        setIsTradingLock(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [trading.buyResult, trading.buyError]);

  return (
    <div className="relative">
      {/* 🟢 QUANT CONTROL HUB (มุมขวาล่าง) */}
      {!editMode && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
          {/* Status Live Indicator */}
          {isAuto && (
            <div className="bg-black/90 text-emerald-400 text-xs font-mono px-3 py-1.5 rounded-lg border border-emerald-500/40 backdrop-blur-md shadow-xl flex items-center gap-2 max-w-[320px] truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>{lastSignalLog}</span>
            </div>
          )}

          {/* 🎛️ แผงปรับเลือก BARRIER OVER / UNDER โชว์เด่นบน UI */}
          {botStrategy === 'OU_QUANT' && (
            <div className="flex items-center gap-2 bg-black/90 p-2 rounded-xl border border-amber-500/30 backdrop-blur-md shadow-2xl text-xs font-bold">
              <span className="text-amber-400">Target Barrier:</span>
              <div className="flex items-center gap-1">
                <span className="text-gray-300">Over &gt;</span>
                <select
                  value={overBarrier}
                  onChange={(e) => setOverBarrier(Number(e.target.value))}
                  className="bg-gray-800 text-emerald-400 font-bold px-2 py-1 rounded border border-gray-600 focus:outline-none"
                >
                  {[0, 1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1 ml-2">
                <span className="text-gray-300">Under &lt;</span>
                <select
                  value={underBarrier}
                  onChange={(e) => setUnderBarrier(Number(e.target.value))}
                  className="bg-gray-800 text-rose-400 font-bold px-2 py-1 rounded border border-gray-600 focus:outline-none"
                >
                  {[4, 5, 6, 7, 8, 9].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Strategy Selector */}
          <div className="flex bg-black/90 p-1 rounded-xl border border-white/10 backdrop-blur-md shadow-2xl gap-1">
            <button
              type="button"
              onClick={() => setBotStrategy('OU_QUANT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                botStrategy === 'OU_QUANT'
                  ? 'bg-amber-400 text-black shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Over/Under Fast
            </button>
            <button
              type="button"
              onClick={() => setBotStrategy('DIFF_CLUSTER')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                botStrategy === 'DIFF_CLUSTER'
                  ? 'bg-cyan-400 text-black shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Differ Cluster
            </button>
            <button
              type="button"
              onClick={() => setBotStrategy('EVEN_ODD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                botStrategy === 'EVEN_ODD'
                  ? 'bg-purple-400 text-black shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Even/Odd
            </button>
          </div>

          {/* Main Action Button */}
          <button
            type="button"
            onClick={() => setIsAuto(!isAuto)}
            className={`px-6 py-3.5 rounded-full font-black text-sm shadow-2xl transition-all border-2 active:scale-95 ${
              isAuto
                ? 'bg-red-500 hover:bg-red-600 text-white border-red-300 animate-pulse shadow-red-500/50'
                : 'bg-emerald-400 hover:bg-emerald-500 text-black border-emerald-200 shadow-emerald-500/30'
            }`}
          >
            {isAuto ? '⏹️ STOP QUANT BOT' : `🚀 START QUANT (${botStrategy})`}
          </button>
        </div>
      )}

      <DigitsView
        authState={authState}
        accounts={accounts}
        activeAccount={activeAccount}
        onLogin={login}
        onSignUp={signUp}
        onLogout={logout}
        onSwitchAccount={switchAccount}
        logoSrc={logoSrc}
        appName={appName}
        isConnected={trading.isConnected}
        isLoading={trading.isLoading}
        error={trading.error}
        symbols={trading.symbols}
        activeSymbol={trading.activeSymbol}
        selectSymbol={trading.selectSymbol}
        currentTick={trading.currentTick}
        lastDigit={trading.lastDigit}
        digitStats={trading.digitStats}
        pipSize={trading.pipSize}
        tradeType={trading.tradeType}
        setTradeType={trading.setTradeType}
        contractMode={trading.contractMode}
        setContractMode={trading.setContractMode}
        selectedDigit={trading.selectedDigit}
        setSelectedDigit={trading.setSelectedDigit}
        stake={trading.stake}
        setStake={trading.setStake}
        duration={trading.duration}
        setDuration={trading.setDuration}
        durationLimits={trading.durationLimits}
        proposal={trading.proposal}
        isProposalLoading={trading.isProposalLoading}
        buyContract={trading.buyContract}
        isBuying={trading.isBuying}
        buyResult={trading.buyResult}
        buyError={trading.buyError}
        clearBuyResult={trading.clearBuyResult}
        appConfig={appConfig}
        editMode={editMode}
        onSelect={onSelect}
        selectedKey={selectedKey}
        rearrangeMode={rearrangeMode}
        onReorder={onReorder}
      />
    </div>
  );
}
