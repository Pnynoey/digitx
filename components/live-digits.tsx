'use client';

/**
 * Institutional Quant Digits AI Engine
 * Strategies: Dynamic Z-Score Over/Under, Anti-Siphon Differ, Poisson Even/Odd
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
  // 🚀 QUANT MULTI-STRATEGY ENGINE STATE
  // ------------------------------------------------------------------
  const [isAuto, setIsAuto] = useState<boolean>(false);
  const [botStrategy, setBotStrategy] = useState<'OU_QUANT' | 'DIFF_CLUSTER' | 'EVEN_ODD'>('OU_QUANT');
  const [isTradingLock, setIsTradingLock] = useState<boolean>(false);
  const [lastSignalLog, setLastSignalLog] = useState<string>('System Ready');
  const tickHistoryRef = useRef<number[]>([]);

  // 1. WebSocket Main Execution Loop
  useEffect(() => {
    if (trading.lastDigit !== undefined && trading.lastDigit !== null) {
      const history = tickHistoryRef.current;
      history.push(trading.lastDigit);
      if (history.length > 20) history.shift(); // เก็บสถิติย้อนหลัง 20 ตา

      if (isAuto && !isTradingLock && !trading.isBuying && history.length >= 15) {
        
        // ===========================================================
        // 🧠 STRATEGY 1: OVER / UNDER (Z-score & Volatility Expansion)
        // ===========================================================
        if (botStrategy === 'OU_QUANT') {
          const sample = history.slice(-15);
          const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
          const variance = sample.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sample.length;
          const stdDev = Math.sqrt(variance) || 1;

          const lastDigit = sample[sample.length - 1];
          const prevDigit = sample[sample.length - 2];
          const zScore = (lastDigit - mean) / stdDev;

          // 条件 OVER 2: Z-Score ติดลบหนัก (อัดโซนต่ำ) + มีการดีดกลับเกิน 2 ติดกัน
          if (zScore < -1.1 && lastDigit >= 3 && prevDigit >= 2) {
            triggerTrade('DIGITOVER', 2, `🔥 Quant OVER 2 (Z-Score: ${zScore.toFixed(2)} | Mean: ${mean.toFixed(1)})`);
          } 
          // 条件 UNDER 7: Z-Score บวกสูงจัด (อัดโซนสูง) + เริ่มหักหัวลง
          else if (zScore > 1.1 && lastDigit <= 6 && prevDigit <= 7) {
            triggerTrade('DIGITUNDER', 7, `⚡ Quant UNDER 7 (Z-Score: ${zScore.toFixed(2)} | Mean: ${mean.toFixed(1)})`);
          }
        } 

        // ===========================================================
        // 🧠 STRATEGY 2: DIFFER (Anti-Siphon & Rejection Entropy)
        // ===========================================================
        else if (botStrategy === 'DIFF_CLUSTER') {
          const len = history.length;
          const d1 = history[len - 1];
          const d2 = history[len - 2];
          const d3 = history[len - 3];

          // Pattern: ซ้ำติดกัน 2 ตา แล้วโดนขัดจังหวะด้วยเลข Extreme (0 หรือ 9 หรือ เลขต่างกลุ่ม)
          if (d3 === d2 && d1 !== d2 && (d1 === 0 || d1 === 9 || Math.abs(d1 - d2) >= 4)) {
            triggerTrade('DIGITDIFF', d2, `🎯 Differ Anti-Siphon (Avoid Digit: ${d2})`);
          }
        }

        // ===========================================================
        // 🧠 STRATEGY 3: EVEN / ODD (Poisson Distribution Equilibrium)
        // ===========================================================
        else if (botStrategy === 'EVEN_ODD') {
          const recent12 = history.slice(-12);
          const evenCount = recent12.filter(d => d % 2 === 0).length;
          const oddCount = 12 - evenCount;

          // ถ้า Even ออกทะลุ 75% (9 ใน 12 ตา) ➔ สวนยิง ODD
          if (evenCount >= 9) {
            triggerTrade('DIGITODD', 0, `⚖️ Poisson Mean Reversion: Bet ODD (Even Ratio: ${((evenCount/12)*100).toFixed(0)}%)`);
          } 
          // ถ้า Odd ออกทะลุ 75% (9 ใน 12 ตา) ➔ สวนยิง EVEN
          else if (oddCount >= 9) {
            triggerTrade('DIGITEVEN', 0, `⚖️ Poisson Mean Reversion: Bet EVEN (Odd Ratio: ${((oddCount/12)*100).toFixed(0)}%)`);
          }
        }
      }
    }
  }, [trading.lastDigit, isAuto, isTradingLock, trading.isBuying, botStrategy]);

  // Execute Orders Function
  const triggerTrade = (tradeType: string, barrier: number, logMsg: string) => {
    setIsTradingLock(true);
    setLastSignalLog(logMsg);
    console.log(`[QUANT AI] ${logMsg}`);

    try {
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

    trading.setSelectedDigit(barrier);

    setTimeout(() => {
      trading.buyContract();
    }, 300);
  };

  // Auto Release Lock System
  useEffect(() => {
    if (trading.buyResult || trading.buyError) {
      const timer = setTimeout(() => {
        trading.clearBuyResult();
        setIsTradingLock(false);
      }, 2200);
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
            <div className="bg-black/90 text-emerald-400 text-xs font-mono px-3 py-1.5 rounded-lg border border-emerald-500/40 backdrop-blur-md shadow-xl flex items-center gap-2 max-w-[280px] truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>{lastSignalLog}</span>
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
              Over/Under Z-Score
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
              Differ Anti-Siphon
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
              Even/Odd Poisson
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
