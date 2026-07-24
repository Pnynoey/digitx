'use client';

/**
 * Deriv App Builder - Continuous Execution Quant Bot
 * File: components/live-digits.tsx
 */

import React, { useEffect, useState, useRef } from 'react';
import { useDigitsTrading } from '../hooks/use-digits-trading';
import { useDerivWSContext } from '@/components/custom/deriv-ws-provider';
import { useLogoSrc } from '@/components/custom/logo-src-provider';
import { DigitsView } from './digits-view';
import type { DigitsAppConfig } from '../lib/app-config';

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

  const trading: any = useDigitsTrading({
    ws,
    isConnected,
    isExhausted,
    isAuthenticated: !!auth.wsUrl,
    onAuthWSFailed: logout,
  });

  const [mounted, setMounted] = useState(false);
  const [isAuto, setIsAuto] = useState(false);
  const [botStrategy, setBotStrategy] = useState<'OU_QUANT' | 'DIFF_CLUSTER' | 'EVEN_ODD'>('OU_QUANT');
  const [statusLog, setStatusLog] = useState('พร้อมทำงาน');
  const [isLock, setIsLock] = useState(false);

  const historyRef = useRef<number[]>([]);
  const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // สลับโหมดการเทรดบน UI
  const handleStrategyChange = (newStrategy: 'OU_QUANT' | 'DIFF_CLUSTER' | 'EVEN_ODD') => {
    setBotStrategy(newStrategy);
    try {
      if (newStrategy === 'OU_QUANT') {
        if (trading?.setContractMode) trading.setContractMode('OVER_UNDER');
        if (trading?.setTradeType) trading.setTradeType('DIGITOVER');
        if (trading?.setSelectedDigit) trading.setSelectedDigit(2);
      } else if (newStrategy === 'DIFF_CLUSTER') {
        if (trading?.setContractMode) trading.setContractMode('MATCHES_DIFF');
        if (trading?.setTradeType) trading.setTradeType('DIGITDIFF');
        if (trading?.setSelectedDigit) trading.setSelectedDigit(0);
      } else if (newStrategy === 'EVEN_ODD') {
        if (trading?.setContractMode) trading.setContractMode('EVEN_ODD');
        if (trading?.setTradeType) trading.setTradeType('DIGITEVEN');
      }
    } catch (e) {
      console.warn('Mode change sync notice:', e);
    }
  };

  // Main Loop สแกน Ticks
  useEffect(() => {
    // หากติด Lock หรือกำลังกดซื้ออยู่ จะข้ามการวิเคราะห์ไปก่อน
    if (!mounted || !isAuto || isLock || trading?.isBuying) return;

    const currentDigit = trading?.lastDigit;
    if (typeof currentDigit === 'number') {
      const history = historyRef.current;
      if (history.length === 0 || history[history.length - 1] !== currentDigit) {
        history.push(currentDigit);
        if (history.length > 15) history.shift();
      }

      if (history.length >= 5) {
        const sample = history.slice(-5);
        const last = sample[sample.length - 1];

        // 🧠 Strategy 1: Over / Under
        if (botStrategy === 'OU_QUANT') {
          const lowCount = sample.filter((d) => d <= 3).length;
          const highCount = sample.filter((d) => d >= 6).length;

          if (lowCount >= 3 && last >= 2) {
            safeBuy('DIGITOVER', 2, '🔥 OVER 2 Signal');
          } else if (highCount >= 3 && last <= 7) {
            safeBuy('DIGITUNDER', 7, '⚡ UNDER 7 Signal');
          }
        }
        // 🧠 Strategy 2: Differ
        else if (botStrategy === 'DIFF_CLUSTER' && history.length >= 4) {
          const len = history.length;
          if (history[len - 3] === history[len - 2] && history[len - 1] !== history[len - 2]) {
            const avoidDigit = history[len - 2];
            safeBuy('DIGITDIFF', avoidDigit, `🎯 DIFFER ${avoidDigit} Signal`);
          }
        }
        // 🧠 Strategy 3: Even / Odd
        else if (botStrategy === 'EVEN_ODD' && history.length >= 6) {
          const sample6 = history.slice(-6);
          const evenCount = sample6.filter((d) => d % 2 === 0).length;
          if (evenCount >= 4) {
            safeBuy('DIGITODD', 0, '⚖️ ODD Signal');
          } else if (6 - evenCount >= 4) {
            safeBuy('DIGITEVEN', 0, '⚖️ EVEN Signal');
          }
        }
      }
    }
  }, [trading?.lastDigit, isAuto, isLock, trading?.isBuying, botStrategy, mounted]);

  // ฟังก์ชันสั่งซื้อและจัดการเรื่อง Timeout ปลดล็อก
  const safeBuy = (tradeType: string, barrier: number, msg: string) => {
    setIsLock(true);
    setStatusLog(`${msg} (กำลังเตรียมออเดอร์...)`);

    // 🛡️ Safety Timer: ถ้าผ่านไป 8 วินาทีแล้วยังไม่ปลดล็อก ให้บังคับ Reset ทันที (ป้องกันบอทค้าง)
    if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
    lockTimeoutRef.current = setTimeout(() => {
      console.warn('Safety Unlock Triggered');
      setIsLock(false);
      setStatusLog('พร้อมสแกนหาจังหวะใหม่...');
    }, 8000);

    try {
      if (trading?.setTradeType) trading.setTradeType(tradeType);
      if (trading?.setSelectedDigit) trading.setSelectedDigit(barrier);

      let attempts = 0;
      const maxAttempts = 10;

      const checkAndBuy = setInterval(() => {
        attempts++;
        const hasProposal = !!trading?.proposal && !trading?.isProposalLoading;
        
        if (hasProposal || attempts >= maxAttempts) {
          clearInterval(checkAndBuy);
          try {
            if (trading?.buyContract) {
              setStatusLog(`${msg} 🚀 ยิงคำสั่งซื้อแล้ว!`);
              trading.buyContract();
            }
          } catch (err) {
            console.error('Execution Buy Failure:', err);
            setStatusLog('⚠️ ส่งออเดอร์ไม่สำเร็จ');
            setIsLock(false);
          }
        }
      }, 100);
    } catch (e) {
      console.error('Safe setup failed:', e);
      setIsLock(false);
    }
  };

  // เคลียร์ผลการเทรดและปลดล็อกเมื่อทราบผลลัพธ์
  useEffect(() => {
    if (trading?.buyResult || trading?.buyError) {
      if (trading?.buyError) {
        setStatusLog(`❌ เทรดล้มเหลว: ${trading.buyError?.message || 'Unknown Error'}`);
      } else if (trading?.buyResult) {
        setStatusLog('✅ ส่งคำสั่งเทรดสำเร็จ!');
      }

      const timer = setTimeout(() => {
        try {
          if (trading?.clearBuyResult) trading.clearBuyResult();
        } catch (e) {}
        
        if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
        setIsLock(false);
        setStatusLog('พร้อมสแกนตาถัดไป...');
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [trading?.buyResult, trading?.buyError]);

  return (
    <div className="relative">
      {/* 🟢 FLOAT BOT CONTROL */}
      {mounted && !props.editMode && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 font-sans select-none">
          {/* Live Status */}
          {isAuto && (
            <div className="bg-black/90 text-emerald-400 text-xs px-3.5 py-1.5 rounded-xl border border-emerald-500/40 backdrop-blur-md shadow-2xl flex items-center gap-2 max-w-[280px] truncate">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>{statusLog}</span>
            </div>
          )}

          {/* Quick Barrier Set */}
          <div className="flex bg-black/90 p-1.5 rounded-xl border border-white/10 backdrop-blur-md gap-1 items-center">
            <span className="text-[10px] text-amber-400 font-bold px-1">Barrier:</span>
            {[2, 3, 6, 7].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  try {
                    trading?.setSelectedDigit?.(num);
                  } catch (e) {}
                }}
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

          {/* Strategy Mode */}
          <div className="flex bg-black/90 p-1 rounded-xl border border-white/10 backdrop-blur-md gap-1">
            <button
              type="button"
              onClick={() => handleStrategyChange('OU_QUANT')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                botStrategy === 'OU_QUANT' ? 'bg-amber-400 text-black shadow-md' : 'text-gray-400'
              }`}
            >
              Over/Under
            </button>
            <button
              type="button"
              onClick={() => handleStrategyChange('DIFF_CLUSTER')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                botStrategy === 'DIFF_CLUSTER' ? 'bg-cyan-400 text-black shadow-md' : 'text-gray-400'
              }`}
            >
              Differ
            </button>
            <button
              type="button"
              onClick={() => handleStrategyChange('EVEN_ODD')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                botStrategy === 'EVEN_ODD' ? 'bg-purple-400 text-black shadow-md' : 'text-gray-400'
              }`}
            >
              Even/Odd
            </button>
          </div>

          {/* Start/Stop Button */}
          <button
            type="button"
            onClick={() => setIsAuto(!isAuto)}
            className={`px-5 py-3 rounded-full font-black text-xs shadow-2xl transition-all border active:scale-95 ${
              isAuto
                ? 'bg-red-500 text-white border-red-300 animate-pulse shadow-red-500/50'
                : 'bg-emerald-400 text-black border-emerald-200 shadow-emerald-500/30'
            }`}
          >
            {isAuto ? '⏹️ STOP AUTO' : `🚀 START AUTO (${botStrategy})`}
          </button>
        </div>
      )}

      {/* Main Deriv Digits Page */}
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
