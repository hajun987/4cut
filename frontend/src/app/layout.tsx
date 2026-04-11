import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '인생네컷 포토부스',
  description: '웹캠을 이용한 키오스크 형태의 4컷 사진기',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased w-full min-h-[100dvh] bg-background text-foreground p-0 m-0 overflow-y-auto">
        {children}
      </body>
    </html>
  );
}
