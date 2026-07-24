'use client';

/**
 * Deriv App Builder - Complete & Isolated Quant Trading Bot
 * File: components/live-digits.tsx
 */

import React, { useEffect, useState, useRef } from 'react';
import { useDigitsTrading } from '../hooks/use-digits-trading';
import { useDerivWSContext } from '@/components/custom/deriv-ws-provider';
import { useLogoSrc } from '@/components/custom/logo-src-provider';
import { DigitsView } from './digits-view';
import type { DigitsAppConfig } from '../lib/app-config';

// ------------------------------------------------------------------
// 🎛️ ISOLATED BOT CONTROLLER ENGINE (ตัวควบคุมระบบออโต้เทรด)
// ------------------------------------------------------------------
function BotController({ trading }: { trading: any }) {
  const [isAuto, setIsAuto] = useState<boolean>(false);
  const [botStrategy, setBotStrategy] = useState<'OU_QUANT' | 'DIFF_CLUSTER' | 'EVEN_ODD'>('OU_QUANT');
  const [isTradingLock, setIsTradingLock] = useState<boolean>(false);
  const [statusLog, setStatusLog] = useState<string>('ระบบพร้อมทำงาน');

  const historyRef = useRef<number[]>([]);

  // 🎯 ฟังก์ชันซิงค์ปุ่ม Barrier กับ Deriv UI โดยตรง
  const handleSyncBarrier = (digit: number) => {
    try {
      if (trading && typeof trading.setSelectedDigit === 'function') {
        trading.setSelectedDigit(digit);
      }
    } catch (e) {
      console.warn('Sync barrier notice:', e);
    }
  };

  // 🧠 MAIN ENGINE LOOP: ประมวลผล Ticks และยิงออเดอร์
  useEffect(() => {
    if (!isAuto || isTradingLock || trading?.isBuying) return;

    const lastDigit = trading?.lastDigit;
    if (lastDigit !== undefined && lastDigit !== null) {
      const history = historyRef.current;
      
      // อัปเดตข้อมูล Ticks ย้อนหลัง
      if (history.length === 0 || history[history.length - 1] !== lastDigit) {
        history.push(lastDigit);
        if (history.length > 15) history.shift();
      }

      // เช็คว่ามีสถิติเพียงพอในการวิเคราะห์ (5 ตาขึ้นไป)
      if (history.length >= 5) {
        const sample = history.slice(-5);
        const currentDigit = sample[sample.length - 1];

        // -----------------------------------------------------------
        // 1. STRATEGY: OVER / UNDER QUANT ENGINE
        // -----------------------------------------------------------
        if (botStrategy === 'OU_QUANT') {
          const lowCount = sample.filter((d) => d <= 3).length;
          const highCount = sample.filter((d) => d >= 6).length;

          // เงื่อนไข OVER 2 (เมื่อเลขอัดอยู่โซนต่ำ แล้วเริ่มดีดตัวขึ้น)
          if (lowCount >= 3 && currentDigit >= 2) {
            executeTrade('DIGITOVER', 2, 'OVER_UNDER', '🔥 ยิง OVER 2 (Low Cluster)');
          } 
          // เงื่อนไข UNDER 7 (เมื่อเลขอัดอยู่โซนสูง แล้วเริ่มหักหัวลง)
          else if (highCount >= 3 && currentDigit <= 7) {
            executeTrade('DIGITUNDER', 7, 'OVER_UNDER', '⚡ ยิง UNDER 7 (High Cluster)');
          }
        }
        // -----------------------------------------------------------
        // 2. STRATEGY: DIFFER CLUSTER ANTI-SIPHON
        // -----------------------------------------------------------
        else if (botStrategy === 'DIFF_CLUSTER' && history.length >= 4) {
          const len = history.length;
          const d1 = history[len - 1];
          const d2 = history[len - 2];
          const d3 = history[len - 3];

          // ซ้ำติดกัน 2 ตา แล้วโดนขัดจังหวะด้วยเลขต่างกลุ่ม
          if (d3 === d2 && d1 !== d2) {
            executeTrade('DIGITDIFF', d2, 'MATCHES_DIFF', `🎯 ยิง DIFFER (ห้ามออก ${d2})`);
          }
        }
        // -----------------------------------------------------------
        // 3. STRATEGY: EVEN / ODD POISSON EQUILIBRIUM
        // -----------------------------------------------------------
        else if (botStrategy === 'EVEN_ODD' && history.length >= 6) {
          const sample6 = history.slice(-6);
          const evenCount = sample6.filter((d) => d % 2 === 0).length;
          const oddCount = 6 - evenCount;

          if (evenCount >= 4) {
            executeTrade('DIGITODD', 0, 'EVEN_ODD', '⚖️ สวนยิง ODD (Even Overbought)');
          } else if (oddCount >= 4) {
            executeTrade('DIGITEVEN', 0, 'EVEN_ODD', '⚖️ สวนยิง EVEN (Odd Overbought)');
          }
        }
      }
    }
  }, [trading?.lastDigit, isAuto, isTradingLock, trading?.isBuying, botStrategy]);

  // 🚀 ฟังก์ชันส่งคำสั่งเทรดแบบซิงค์ UI
  const executeTrade = (tradeType: string, barrier: number, contractMode: string, msg: string) => {
    setIsTradingLock(true);
    setStatusLog(msg);

    try {
      handleSyncBarrier(barrier);
      if (trading?.setTradeType) (trading.setTradeType as any)(tradeType);
      if (trading?.setContractMode) (trading.setContractMode as any)(contractMode);

      setTimeout(() => {
        if (trading?.buyContract) {
          trading.buyContract();
        }
      }, 300);
    } catch (err) {
      console.error('Order Execution Error:', err);
    }
  };

  // 🔓 ปลดล็อกระบบหลังจบสัญญา
  useEffect(() => {
    if (trading?.buyResult || trading?.buyError) {
      const timer = setTimeout(() => {
        if (trading?.clearBuyResult) {
          trading.clearBuyResult();
        }
        setIsTradingLock(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [trading?.buyResult, trading?.buyError]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 font-sans select-none">
      {/* status log */}
      {isAuto && (
        <div className="bg-black/90 text-emerald-400 text-xs px-3.5 py-1.5 rounded-xl border border-emerald-500/40 backdrop-blur-md shadow-2xl flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>{statusLog}</span>
        </div>
      )}

      {/* Sync Barrier Quick Buttons */}
      <div className="flex bg-black/90 p-1.5 rounded-xl border border-white/10 backdrop-blur-md gap-1 items-center">
        <span className="text-[10px] text-amber-400 font-bold px-1">Deriv Barrier:</span>
        {[2, 3, 6, 7].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => handleSyncBarrier(num)}
            className={`px-2 py-0.5 rounded text-xs font-bold transition-all ${
              trading?.selectedDigit === num
                ? 'bg-amber-400 text-black shadow-md'
                : 'bg-gray-800 text-gray-300 hover:text-white'
            }`}
          >
            {num}
          </button>
        ))}
      </div>

      {/* Strategy Selector */}
      <div className="flex bg-black/90 p-1 rounded-xl border border-white/10 backdrop-blur-md gap-1">
        <button
          type="button"
          onClick={() => setBotStrategy('OU_QUANT')}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            botStrategy === 'OU_QUANT' ? 'bg-amber-400 text-black shadow-md' : 'text-gray-400'
          }`}
        >
          Over/Under
        </button>
        <button
          type="button"
          onClick={() => setBotStrategy('DIFF_CLUSTER')}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            botStrategy === 'DIFF_CLUSTER' ? 'bg-cyan-400 text-black shadow-md' : 'text-gray-400'
          }`}
        >
          Differ
        </button>
        <button
          type="button"
          onClick={() => setBotStrategy('EVEN_ODD')}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            botStrategy === 'EVEN_ODD' ? 'bg-purple-400 text-black shadow-md' : 'text-gray-400'
          }`}
        >
          Even/Odd
        </button>
      </div>

      {/* Main Start/Stop Button */}
      <button
        type="button"
        onClick={() => setIsAuto(!isAuto)}
        className={`px-5 py-3 rounded-full font-black text-xs shadow-2xl transition-all border active:scale-95 ${
          isAuto
            ? 'bg-red-500 text-white border-red-300 animate-pulse shadow-red-500/50'
            : 'bg-emerald-400 text-black border-emerald-200 shadow-emerald-500/30'
        }`}
      >
        {isAuto ? '⏹️ STOP AUTOMATION' : `🚀 START AUTO (${botStrategy})`}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// MAIN LIVE DIGITS EXPORT COMPONENT
// ------------------------------------------------------------------
export function LiveDigits(props: {
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
  const logoSrc = props.logoSrc ?? providerLogo;
  const { ws, isConnected, isExhausted, auth } = useDerivWSContext();
  const { authState, accounts, activeAccount, login, signUp, logout, switchAccount } = auth;

  const trading = useDigitsTrading({
    ws,
    isConnected,
    isExhausted,
    isAuthenticated: !!auth.wsUrl,
    onAuthWSFailed: logout,
  });

  const [mounted, setMounted] = useState<boolean>(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative">
      {/* โหลด BotController เฉพาะเมื่อ Render บน Client เสร็จสิ้นเรียบร้อย */}
      {mounted && !props.editMode && <BotController trading={trading} />}

      <DigitsView
        authState={authState}
        accounts={accounts}
        activeAccount={activeAccount}
        onLogin={login}
        onSignUp={signUp}
        onLogout={logout}
        onSwitchAccount={switchAccount}
        logoSrc={logoSrc}
        appName={props.appName}
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
        appConfig={props.appConfig}
        editMode={props.editMode}
        onSelect={props.onSelect}
        selectedKey={props.selectedKey}
        rearrangeMode={props.rearrangeMode}
        onReorder={props.onReorder}
      />
    </div>
  );
}
