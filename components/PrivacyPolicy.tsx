import React from 'react';
import { motion } from 'motion/react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
  return (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto min-h-screen">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-10 rounded-[3rem] space-y-8 border-white/10 shadow-2xl"
      >
        <div className="space-y-4">
          <h2 className="text-4xl font-black tracking-tight gradient-text">Privacy Policy</h2>
          <p className="text-slate-400 font-medium">Welcome to TestTrail.</p>
          <p className="text-slate-400 font-medium">We value your privacy and are committed to protecting your personal information.</p>
        </div>

        <div className="space-y-6 text-slate-300">
          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">1. Information We Collect</h3>
            <p>We may collect basic information such as your name, email address, and login details when you use our app.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">2. How We Use Your Information</h3>
            <p>We use your data to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide and improve our services</li>
              <li>Allow you to access quizzes and premium features</li>
              <li>Communicate important updates</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">3. Payment Information</h3>
            <p>All payments are processed securely through third-party payment gateways. We do not store your card or payment details on our servers.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">4. Data Sharing</h3>
            <p>We do not sell, trade, or share your personal information with third parties, except as required for providing our services.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">5. Data Security</h3>
            <p>We take appropriate measures to protect your data from unauthorized access.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">6. User Rights</h3>
            <p>You can request to update or delete your data by contacting us.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">7. Changes to Policy</h3>
            <p>We may update this policy from time to time.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">8. Contact Us</h3>
            <p>If you have any questions, contact us at:</p>
            <p>Email: <a href="mailto:support@testtrail.com" className="text-indigo-400 hover:underline">support@testtrail.com</a></p>
          </section>
        </div>

        <div className="pt-6 border-t border-white/5">
          <button 
            onClick={onBack}
            className="px-8 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all border border-white/10"
          >
            Back to Home
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default PrivacyPolicy;
