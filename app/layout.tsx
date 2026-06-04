import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PPI Insight · 미국 생산자물가 추이 분석',
  description: '미국 PPI(생산자물가지수)를 FRED 데이터 기반으로 시각화하는 분석 대시보드',
  icons: { icon: '/assets/ppi-mark.png' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full">
        {children}
      </body>
    </html>
  )
}
