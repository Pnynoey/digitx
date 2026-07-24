'use client';

/**
 * Deriv App Builder - Safe Quant Bot with Error Boundary Protection
 */

import React, { useEffect, useState, useRef } from 'react';
import { useDigitsTrading } from '../hooks/use-digits-trading';
import { useDerivWSContext } from '@/components/custom/deriv-ws-provider';
import { useLogoSrc } from '@/components/custom/logo-src-provider';
import { DigitsView } from './digits-view';
import type { DigitsAppConfig } from '../lib/app-config';

// 🛡️ CLASS ERROR BOUNDARY (ป้องกัน React Crash 100%)
class BotErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Bot Error Intercepted:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed bottom-4 right-4 z-50 bg-red-900/90 text-white text-xs px-3 py-2 rounded-lg border border-red-500">
          ⚠️ Bot Component Reset Required
          <button 
            onClick={() => this.setState({ hasError: false })}
            className="ml-2 underline font-bold"
          >
            Reload Bot
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  return (
    <BotErrorBoundary>
      <LiveDigitsInner {...props} />
    </BotErrorBoundary>
  );
}

function LiveDigitsInner({
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

  const [isClient, setIsClient] = useState(false);
  const [isAuto, setIsAuto] = useState<boolean>(false);
  const [botStrategy, setBotStrategy] = useState<'OU_QUANT' | 'DIFF_CLUSTER' | 'EVEN_ODD'>('OU_QUANT');
  const [isTradingLock, setIsTradingLock] = useState<boolean>(false);
  const [statusLog, setStatusLog] = useState<string>('พร้อมใช้งาน');

  const tickHistoryRef = useRef<number[]>([]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 1. ซิงค์ค่า Barrier กับระบบ Deriv
  const syncBarrier = (digit: number) => {
    try {
      if (trading?.setSelectedDigit) {
        trading.setSelectedDigit(digit);
      }
    } catch (e) {
      console.warn('Sync Barrier error:', e);
    }
  };

  // 2. Loop หลักในการรันบอท
  useEffect(() => {
    if (!isClient || !isAuto || isTradingLock || trading?.isBuying) return;

    if (trading?.lastDigit !== undefined && trading?.lastDigit !== null) {
      const history = tickHistoryRef.current;
      history.push(trading.lastDigit);
      if (history.length > 15) history.shift();

      if (history.length >= 5) {
        const sample = history.slice(-5);
        const lastDigit = sample[sample.length - 1];

        // OVER / UNDER
        if (botStrategy === 'OU_QUANT') {
          const lowCount = sample.filter(d => d <= 3).length;
          const highCount = sample.filter(d => d >= 6).length;

          if (lowCount >= 3 && lastDigit >= 2) {
            executeTrade('DIGITOVER', 2, 'OVER_UNDER', '🔥 OVER 2 Signal');
          } else if (highCount >= 3 && lastDigit <= 7) {
            executeTrade('DIGITUNDER', 7, 'OVER_UNDER', '⚡ UNDER 7 Signal');
          }
        }
        // DIFFER
        else if (botStrategy === 'DIFF_CLUSTER' && history.length >= 4) {
          const len = history.length;
          if (history[len - 3] === history[len - 2] && history[len - 1] !== history[len - 2]) {
            executeTrade('DIGITDIFF', history[len - 2], 'MATCHES_DIFF', `🎯 DIFFER ${history[len - 2]} Signal`);
          }
        }
        // EVEN / ODD
        else if (botStrategy === 'EVEN_ODD' && history.length >= 6) {
          const sample6 = history.slice(-6);
          const evenCount = sample6.filter(d => d % 2 === 0).length;
          if (evenCount >= 4) {
            executeTrade('DIGITODD', 0, 'EVEN_ODD', '⚖️ ODD Signal');
          } else if ((6 - evenCount) >= 4) {
            executeTrade('DIGITEVEN', 0, 'EVEN_ODD', '⚖️ EVEN Signal');
          }
        }
      }
    }
  }, [trading?.lastDigit, isAuto, isTradingLock, trading?.isBuying, botStrategy, isClient]);

  const executeTrade = (tradeType: string, barrier: number, contractMode: string, msg: string) => {
    setIsTradingLock(true);
    setStatusLog(msg);

    try {
      syncBarrier(barrier);
      if (trading?.setTradeType) (trading.setTradeType as any)(tradeType);
      if (trading?.setContractMode) (trading.setContractMode as any)(contractMode);
      
      setTimeout(() => {
        if (trading?.buyContract) {
          trading.buyContract();
        }
      }, 300);
    } catch (err) {
      console.error('Execution Error:', err);
    }
  };

  useEffect(() => {
    if (trading?.buyResult || trading?.buyError) {
      const timer = setTimeout(() => {
        if (trading?.clearBuyResult) trading.clearBuyResult();
        setIsTradingLock(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [trading?.buyResult, trading?.buyError]);

  return (
    <div className="relative">
      {/* 🟢 CONTROLS FLOAT */}
      {isClient && !editMode && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 font-sans">
          {isAuto && (
            <div className="bg-black/90 text-emerald-400 text-xs px-3 py-1.5 rounded-xl border border-emerald-500/40 backdrop-blur-md shadow-2xl flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>{statusLog}</span>
            </div>
          )}

          {/* Sync Barrier Test Buttons */}
          <div className="flex bg-black/90 p-1.5 rounded-xl border border-white/10 backdrop-blur-md gap-1 items-center">
            <span className="text-[10px] text-amber-400 font-bold px-1">Barrier:</span>
            {[2, 3, 6, 7].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => syncBarrier(num)}
                className={`px-2 py-0.5 rounded text-xs font-bold ${
                  trading?.selectedDigit === num
                    ? 'bg-amber-400 text-black'
                    : 'bg-gray-800 text-gray-300'
                }`}
              >
                {num}
              </button>
            ))}
          </div>

          {/* Strategy Select */}
          <div className="flex bg-black/90 p-1 rounded-xl border border-white/10 backdrop-blur-md gap-1">
            <button
              type="button"
              onClick={() => setBotStrategy('OU_QUANT')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                botStrategy === 'OU_QUANT' ? 'bg-amber-400 text-black' : 'text-gray-400'
              }`}
            >
              Over/Under
            </button>
            <button
              type="button"
              onClick={() => setBotStrategy('DIFF_CLUSTER')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                botStrategy === 'DIFF_CLUSTER' ? 'bg-cyan-400 text-black' : 'text-gray-400'
              }`}
            >
              Differ
            </button>
            <button
              type="button"
              onClick={() => setBotStrategy('EVEN_ODD')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                botStrategy === 'EVEN_ODD' ? 'bg-purple-400 text-black' : 'text-gray-400'
              }`}
            >
              Even/Odd
            </button>
          </div>

          {/* Start/Stop Button */}
          <button
            type="button"
            onClick={() => setIsAuto(!isAuto)}
            className={`px-5 py-3 rounded-full font-black text-xs shadow-2xl transition-all border ${
              isAuto
                ? 'bg-red-500 text-white border-red-300 animate-pulse'
                : 'bg-emerald-400 text-black border-emerald-200'
            }`}
          >
            {isAuto ? '⏹️ STOP AUTO' : `🚀 START AUTO (${botStrategy})`}
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
