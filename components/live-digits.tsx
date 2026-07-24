'use client';

/**
 * Deriv App Builder - Synchronized Quant Auto Bot Component
 * Fully reactive to Deriv Native UI Controls & Zero-Hydration-Crash Architecture.
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

  // Safe Mount Check (ป้องกัน Hydration Error บน Next.js)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // ------------------------------------------------------------------
  // 🚀 AUTOMATED QUANT ENGINE STATES
  // ------------------------------------------------------------------
  const [isAuto, setIsAuto] = useState<boolean>(false);
  const [botStrategy, setBotStrategy] = useState<'OU_QUANT' | 'DIFF_CLUSTER' | 'EVEN_ODD'>('OU_QUANT');
  const [isTradingLock, setIsTradingLock] = useState<boolean>(false);
  const [lastLog, setLastLog] = useState<string>('พร้อมเชื่อมต่อกับ Deriv UI...');

  const tickHistoryRef = useRef<number[]>([]);

  // 1. ซิงค์ค่า Barrier กับปุ่ม Deriv Native UI
  const syncBarrierWithDeriv = (barrierDigit: number) => {
    if (trading.setSelectedDigit) {
      trading.setSelectedDigit(barrierDigit); // แมตช์เลขบนปุ่มหน้าจอ Deriv ทันที
    }
  };

  // 2. WebSocket Engine สแกน Ticks
  useEffect(() => {
    if (!mounted) return;

    if (trading.lastDigit !== undefined && trading.lastDigit !== null) {
      const history = tickHistoryRef.current;
      history.push(trading.lastDigit);
      if (history.length > 15) history.shift();

      if (isAuto && !isTradingLock && !trading.isBuying && history.length >= 5) {
        const sample = history.slice(-5);
        const lastDigit = sample[sample.length - 1];

        // 🧠 STRATEGY 1: OVER / UNDER
        if (botStrategy === 'OU_QUANT') {
          const lowDigitsCount = sample.filter(d => d <= 3).length;
          const highDigitsCount = sample.filter(d => d >= 6).length;

          // ถ้าเข้าโซนยิง OVER (สุ่มยิง Over 2 - แมตช์ปุ่ม)
          if (lowDigitsCount >= 3 && lastDigit >= 2) {
            executeSynchronizedTrade('DIGITOVER', 2, 'OVER_UNDER', '🔥 ยิง OVER 2 (Low Cluster Exhaustion)');
          } 
          // ถ้าเข้าโซนยิง UNDER (สุ่มยิง Under 7 - แมตช์ปุ่ม)
          else if (highDigitsCount >= 3 && lastDigit <= 7) {
            executeSynchronizedTrade('DIGITUNDER', 7, 'OVER_UNDER', '⚡ ยิง UNDER 7 (High Cluster Exhaustion)');
          }
        }

        // 🧠 STRATEGY 2: DIFFER CLUSTER
        else if (botStrategy === 'DIFF_CLUSTER' && history.length >= 4) {
          const len = history.length;
          const d1 = history[len - 1];
          const d2 = history[len - 2];
          const d3 = history[len - 3];

          if (d3 === d2 && d1 !== d2) {
            executeSynchronizedTrade('DIGITDIFF', d2, 'MATCHES_DIFF', `🎯 ยิง DIFFER ห้ามออกเลข ${d2}`);
          }
        }

        // 🧠 STRATEGY 3: EVEN / ODD
        else if (botStrategy === 'EVEN_ODD' && history.length >= 6) {
          const sample6 = history.slice(-6);
          const evenCount = sample6.filter(d => d % 2 === 0).length;
          const oddCount = 6 - evenCount;

          if (evenCount >= 4) {
            executeSynchronizedTrade('DIGITODD', 0, 'EVEN_ODD', '⚖️ สวนยิง ODD');
          } else if (oddCount >= 4) {
            executeSynchronizedTrade('DIGITEVEN', 0, 'EVEN_ODD', '⚖️ สวนยิง EVEN');
          }
        }
      }
    }
  }, [trading.lastDigit, isAuto, isTradingLock, trading.isBuying, botStrategy, mounted]);

  // 3. ฟังก์ชันสั่งซื้อแบบ Dynamic Mapping (ซิงค์กับ State หลัก)
  const executeSynchronizedTrade = (
    tradeType: string,
    barrierDigit: number,
    contractMode: string,
    logMessage: string
  ) => {
    setIsTradingLock(true);
    setLastLog(logMessage);

    try {
      // ซิงค์ปุ่ม Deriv UI
      syncBarrierWithDeriv(barrierDigit);

      if (trading.setTradeType) (trading.setTradeType as any)(tradeType);
      if (trading.setContractMode) (trading.setContractMode as any)(contractMode);
    } catch (err) {
      console.warn('UI Syncing Notice:', err);
    }

    // ยิงคำสั่งซื้อผ่าน Hook Native
    setTimeout(() => {
      trading.buyContract();
    }, 350);
  };

  // ปลดล็อกระบบหลังจบสัญญา
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
      {/* 🟢 QUANT BOT CONTROL PANEL */}
      {mounted && !editMode && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
          {/* Status Indicator Bar */}
          {isAuto && (
            <div className="bg-black/90 text-emerald-400 text-xs font-mono px-3.5 py-2 rounded-xl border border-emerald-500/40 backdrop-blur-md shadow-2xl flex items-center gap-2 max-w-[320px]">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="truncate">{lastLog}</span>
            </div>
          )}

          {/* Quick Barrier Manual Matcher */}
          <div className="flex bg-black/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md shadow-2xl gap-1 items-center">
            <span className="text-[11px] text-amber-400 font-bold px-2">Deriv Barrier:</span>
            {[2, 3, 6, 7].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => syncBarrierWithDeriv(digit)}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                  trading.selectedDigit === digit
                    ? 'bg-amber-400 text-black shadow-md scale-105'
                    : 'bg-gray-800 text-gray-300 hover:text-white'
                }`}
              >
                {digit}
              </button>
            ))}
          </div>

          {/* Bot Strategy Selector */}
          <div className="flex bg-black/90 p-1 rounded-2xl border border-white/10 backdrop-blur-md shadow-2xl gap-1">
            <button
              type="button"
              onClick={() => setBotStrategy('OU_QUANT')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                botStrategy === 'OU_QUANT'
                  ? 'bg-amber-400 text-black shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Over/Under AI
            </button>
            <button
              type="button"
              onClick={() => setBotStrategy('DIFF_CLUSTER')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                botStrategy === 'DIFF_CLUSTER'
                  ? 'bg-cyan-400 text-black shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Differ AI
            </button>
            <button
              type="button"
              onClick={() => setBotStrategy('EVEN_ODD')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                botStrategy === 'EVEN_ODD'
                  ? 'bg-purple-400 text-black shadow-lg'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Even/Odd AI
            </button>
          </div>

          {/* Main Bot Action Switch */}
          <button
            type="button"
            onClick={() => setIsAuto(!isAuto)}
            className={`px-6 py-3.5 rounded-full font-black text-sm shadow-2xl transition-all border-2 active:scale-95 ${
              isAuto
                ? 'bg-red-500 hover:bg-red-600 text-white border-red-300 animate-pulse shadow-red-500/50'
                : 'bg-emerald-400 hover:bg-emerald-500 text-black border-emerald-200 shadow-emerald-500/30'
            }`}
          >
            {isAuto ? '⏹️ STOP AUTOMATION' : `🚀 START AUTO (${botStrategy})`}
          </button>
        </div>
      )}

      {/* Deriv Core Layout */}
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
