'use client';

import { useState } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import InstallModal from './InstallModal';

export default function LegalLayout({ children }) {
  const [installModalOpen, setInstallModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      <Navbar onOpenInstall={() => setInstallModalOpen(true)} />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        {children}
      </main>
      <Footer onOpenInstall={() => setInstallModalOpen(true)} />
      <InstallModal
        isOpen={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
      />
    </div>
  );
}
