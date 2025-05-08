import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
    title: "Sistem de Programări | Sincronizare în timp real",
    description: "Sistem avansat de programări cu sincronizare în timp real între dispozitive",
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="ro">
            <body className={inter.className}>{children}</body>
        </html>
    )
}
