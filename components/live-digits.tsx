'use client';

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
  // 🚀 ระบบ AUTO TRADING ENGINE (Cluster Trend Differ)
  // ------------------------------------------------------------------
  const [isAuto, setIsAuto] = useState<boolean>(false);
  const [isTradingLock, setIsTradingLock] = useState<boolean>(false);
  const tickHistoryRef = useRef<number[]>([]);

  // 1. ดักจับตัวเลขสด (lastDigit) เพื่อวิเคราะห์ Pattern
  useEffect(() => {
    if (trading.lastDigit !== undefined && trading.lastDigit !== null) {
      const history = tickHistoryRef.current;
      history.push(trading.lastDigit);
      if (history.length > 5) history.shift();

      // 🧠 เงื่อนไข Cluster Trend Differ: ซ้ำติดกัน 2 ตา (d3 == d2) แล้วมีเลขอื่นแทรก (d1 != d2)
      if (isAuto && !isTradingLock && !trading.isBuying && history.length >= 4) {
        const len = history.length;
        const d1 = history[len - 1]; // ตาล่าสุด
        const d2 = history[len - 2]; // ตาก่อนหน้า
        const d3 = history[len - 3]; // 2 ตาก่อนหน้า

        if (d3 === d2 && d1 !== d2) {
          const avoidDigit = d2;
          setIsTradingLock(true);

          console.log(`🤖 AUTO Engine: เจอจังหวะ! สั่งยิง Differ ห้ามออกเลข ${avoidDigit}`);

          // ปรับเลือกเลขห้ามออก
          trading.setSelectedDigit(avoidDigit);

          // สั่งซื้อสัญญาทันที!
          setTimeout(() => {
            trading.buyContract();
          }, 350);
        }
      }
    }
  }, [trading.lastDigit, isAuto, isTradingLock, trading.isBuying]);

  // 2. ปลดล็อกเมื่อคำสั่งเทรดเสร็จสิ้น (คอยสแกนหาตาถัดไป)
  useEffect(() => {
    if (trading.buyResult || trading.buyError) {
      const timer = setTimeout(() => {
        trading.clearBuyResult();
        setIsTradingLock(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [trading.buyResult, trading.buyError]);

  return (
    <div className="relative">
      {/* 🟢 ปุ่มควบคุม AUTO TRADING FLOAT (ลอยเด่นมุมขวาล่างบนหน้าเว็บ) */}
      {!editMode && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
          {isAuto && (
            <div className="bg-black/80 text-emerald-400 text-xs px-3 py-1.5 rounded-lg border border-emerald-500/30 backdrop-blur-md animate-pulse">
              🤖 Auto Trading Engine Active...
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsAuto(!isAuto)}
            className={`px-6 py-3.5 rounded-full font-black text-sm shadow-2xl transition-all border-2 active:scale-95 ${
              isAuto
                ? 'bg-red-500 hover:bg-red-600 text-white border-red-300 animate-pulse shadow-red-500/50'
                : 'bg-emerald-400 hover:bg-emerald-500 text-black border-emerald-200 shadow-emerald-500/30'
            }`}
          >
            {isAuto ? '⏹️ STOP AUTO BOT' : '🚀 START AUTO BOT'}
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
