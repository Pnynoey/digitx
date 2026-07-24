'use client';

/**
 * Institutional Quant Digits AI Engine - Ultra Safe Hydration Version
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
  const [isMounted, setIsMounted] = useState(false);
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
  
  const [overBarrier, setOverBarrier] = useState<number>(2);   // Over 2 (ชนะ 3-9)
  const [underBarrier, setUnderBarrier] = useState<number>(7); // Under 7 (ชนะ 0-6)
  
  const [isTradingLock, setIsTradingLock] = useState<boolean>(false);
  const [lastSignalLog, setLastSignalLog] = useState<string>('พร้อมรันระบบ...');
  const tickHistoryRef = useRef<number[]>([]);

  // ป้องกัน Hydration Error
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 1. WebSocket Main Execution Loop
  useEffect(() => {
    if (!isMounted) return;

    if (trading.lastDigit !== undefined && trading.lastDigit !== null) {
      const history = tickHistoryRef.current;
      history.push(trading.lastDigit);
      if (history.length > 15) history.shift();

      if (isAuto && !isTradingLock && !trading.isBuying && history.length >= 5) {
        
        // 🧠 STRATEGY 1: OVER / UNDER
        if (botStrategy === 'OU_QUANT') {
          const sample = history.slice(-5);
          const lastDigit = sample[sample.length - 1];
          const lowDigitsCount = sample.filter(d => d <= 3).length;
          const highDigitsCount = sample.filter(d => d >= 6).length;

          if (lowDigitsCount >= 3 && lastDigit >= 2) {
            triggerTrade('DIGITOVER', overBarrier, `🔥 OVER ${overBarrier} Trigger`);
          } 
          else if (highDigitsCount >= 3 && lastDigit <= 7) {
            triggerTrade('DIGITUNDER', underBarrier, `⚡ UNDER ${underBarrier} Trigger`);
          }
        } 

        // 🧠 STRATEGY 2: DIFFER
        else if (botStrategy === 'DIFF_CLUSTER' && history.length >= 4) {
          const len = history.length;
          const d1 = history[len - 1];
          const d2 = history[len - 2];
          const d3 = history[len - 3];

          if (d3 === d2 && d1 !== d2) {
            triggerTrade('DIGITDIFF', d2, `🎯 Differ Trigger (Avoid: ${d2})`);
          }
        }

        // 🧠 STRATEGY 3: EVEN / ODD
        else if (botStrategy === 'EVEN_ODD' && history.length >= 6) {
          const sample = history.slice(-6);
          const evenCount = sample.filter(d => d % 2 === 0).length;
          const oddCount = 6 - evenCount;

          if (evenCount >= 4) {
            triggerTrade('DIGITODD', 0, `⚖️ Bet ODD`);
          } else if (oddCount >= 4) {
            triggerTrade('DIGITEVEN', 0, `⚖️ Bet EVEN`);
          }
        }
      }
    }
  }, [trading.lastDigit, isAuto, isTradingLock, trading.isBuying, botStrategy, overBarrier, underBarrier, isMounted]);

  // Execute Order
  const triggerTrade = (tradeType: string, barrier: number, logMsg: string) => {
    setIsTradingLock(true);
    setLastSignalLog(logMsg);

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

  // Release Lock
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
      {/* 🟢 QUANT CONTROL HUB */}
      {isMounted && !editMode && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
          {/* Status Indicator */}
          {isAuto && (
            <div className="bg-black/90 text-emerald-400 text-xs font-mono px-3 py-1.5 rounded-lg border border-emerald-500/40 backdrop-blur-md shadow-xl flex items-center gap-2 max-w-[320px] truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>{lastSignalLog}</span>
            </div>
          )}

          {/* Target Barrier Selector Panel */}
          {botStrategy === 'OU_QUANT' && (
            <div className="flex items-center gap-3 bg-black/90 px-3 py-2 rounded-xl border border-amber-500/30 backdrop-blur-md shadow-2xl text-xs font-bold">
              <span className="text-amber-400">Barrier:</span>
              <div className="flex items-center gap-1">
                <span className="text-emerald-400">Over &gt;</span>
                <button
                  type="button"
                  onClick={() => setOverBarrier((prev) => (prev >= 5 ? 0 : prev + 1))}
                  className="bg-gray-800 hover:bg-gray-700 text-emerald-400 font-black px-2.5 py-1 rounded border border-emerald-500/40"
                >
                  {overBarrier}
                </button>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-rose-400">Under &lt;</span>
                <button
                  type="button"
                  onClick={() => setUnderBarrier((prev) => (prev <= 4 ? 9 : prev - 1))}
                  className="bg-gray-800 hover:bg-gray-700 text-rose-400 font-black px-2.5 py-1 rounded border border-rose-500/40"
                >
                  {underBarrier}
                </button>
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
