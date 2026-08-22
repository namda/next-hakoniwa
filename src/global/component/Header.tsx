/**
 * @module Header
 * @description ヘッダーコンポーネント。
 */
'use client';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { IoBookSharp, IoClose, IoHomeSharp, IoMenu } from 'react-icons/io5';
import { getCookie } from '../function/cookie';
import { useClientFetch } from '../function/fetch/clientFetch';
import { turnStore } from '../store/api/public/turn';
import Button from './Button';
import SignIn from './SignIn';

const AccountMenu = dynamic(() => import('./AccountMenu'), { ssr: false });
const SignUp = dynamic(() => import('./SignUp'), { ssr: false });

export default function Header() {
  const pathname = usePathname();
  const isDevelopmentPage = pathname === '/development';
  const [isDevelopmentHeaderOpen, setIsDevelopmentHeaderOpen] = useState(false);
  const [existsToken, setExistsToken] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isDevelopmentPage || !isDevelopmentHeaderOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDevelopmentHeaderOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDevelopmentPage, isDevelopmentHeaderOpen]);
  const { data, fetch } = useClientFetch(turnStore);

  const refreshTurn = useCallback(async () => {
    await fetch({ method: 'GET', cache: 'no-store' }, { refresh: true });
    // 2秒後に再取得して最新値を確実に反映する
    setTimeout(() => {
      fetch({ method: 'GET', cache: 'no-store' }, { refresh: true });
    }, 2000);
  }, [fetch]);

  useEffect(() => {
    refreshTurn();
  }, [refreshTurn]);

  useEffect(() => {
    const update = () => setExistsToken(!!getCookie('__Host-exists_refresh_token'));
    update(); // 初回
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const [nextUpdateStr, setNextUpdateStr] = useState<string>('');

  useEffect(() => {
    // 毎秒更新時刻を計算して表示を更新する
    const updateNextTime = () => {
      const turnState = data.get;
      if (!turnState || !turnState.next_updated_at) {
        setNextUpdateStr('(自動更新は無効です)');
        return;
      }

      // ターン処理中はポーリングで完了を待つ
      if (turnState.turn_processing === 1) {
        refreshTurn();
        setNextUpdateStr('(更新処理中...)');
        return;
      }

      const remainMs = turnState.next_updated_at - Date.now();

      // 更新予定時刻を過ぎた場合には最新の状態を取得するために再度フェッチする
      if (remainMs <= 0) {
        refreshTurn();
        setNextUpdateStr('(更新処理中...)');
        return;
      }

      const h = Math.floor(remainMs / 3600000);
      const m = Math.floor((remainMs % 3600000) / 60000);
      const s = Math.floor((remainMs % 60000) / 1000);
      if (h > 0) {
        setNextUpdateStr(
          `(次回の更新まであと ${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')})`
        );
      } else {
        setNextUpdateStr(
          `(次回の更新まであと ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')})`
        );
      }
    };

    updateNextTime();
    const id = setInterval(updateNextTime, 1000);
    return () => clearInterval(id);
  }, [data.get, refreshTurn]);

  return (
    <>
      {isDevelopmentPage && (
        <button
          type="button"
          onClick={() => setIsDevelopmentHeaderOpen((open) => !open)}
          className="fixed top-1 left-1 z-[10000] hidden h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-gray-300 bg-white/95 text-xl text-gray-700 shadow-md backdrop-blur-sm hover:bg-gray-50 active:bg-gray-100 min-[876px]:inline-flex"
          aria-label={isDevelopmentHeaderOpen ? 'ナビを閉じる' : 'ナビを開く'}
          aria-expanded={isDevelopmentHeaderOpen}
          aria-controls="development-site-navigation"
          title={isDevelopmentHeaderOpen ? 'ナビを閉じる' : 'ナビを開く'}
        >
          {isDevelopmentHeaderOpen ? <IoClose /> : <IoMenu />}
        </button>
      )}
      <header
        id="development-site-navigation"
        className={`bg-emerald-100 ${
          isDevelopmentPage
            ? isDevelopmentHeaderOpen
              ? 'min-[876px]:fixed min-[876px]:inset-x-0 min-[876px]:top-0 min-[876px]:z-[9998] min-[876px]:shadow-lg'
              : 'min-[876px]:hidden'
            : ''
        }`}
      >
        <nav className={isDevelopmentPage && isDevelopmentHeaderOpen ? 'min-[876px]:pl-11' : ''}>
          <div className="grid grid-cols-3 grid-rows-none items-start gap-0">
            {/* 左カラム */}
            <div>
              <div className="flex justify-start gap-1">
                <Button
                  href="/"
                  size="xs"
                  className="sm:text-sm"
                  category="primary"
                  color="blue"
                  icons={<IoHomeSharp />}
                >
                  ホーム
                </Button>
                <Button
                  href="/manual"
                  size="xs"
                  className="hidden sm:block sm:text-sm"
                  category="outline"
                  color="sky"
                  icons={<IoBookSharp />}
                >
                  取説
                </Button>
              </div>
            </div>
            <div className="sub-title col-span-3 col-start-1 row-start-2 mx-1 min-w-[3em] text-base font-semibold text-shadow-xs/10">
              {`ターン${data.get ? data.get.turn : ''}`}
              <span className="ml-[0.5em]">{nextUpdateStr || '(次回の更新まであと)'}</span>
            </div>

            {/* 中央カラム */}
            <div className="flex justify-center">
              <SignIn />
            </div>

            {/* 右カラム */}
            <div className="flex justify-end">
              {existsToken === null ? null : existsToken ? <AccountMenu /> : <SignUp />}
            </div>
          </div>
        </nav>
      </header>
    </>
  );
}
