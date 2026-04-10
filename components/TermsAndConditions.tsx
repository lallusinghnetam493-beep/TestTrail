import React from 'react';
import { motion } from 'motion/react';

interface TermsAndConditionsProps {
  onBack: () => void;
}

const TermsAndConditions: React.FC<TermsAndConditionsProps> = ({ onBack }) => {
  return (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto min-h-screen">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-10 rounded-[3rem] space-y-8 border-white/10 shadow-2xl"
      >
        <div className="space-y-4">
          <h2 className="text-4xl font-black tracking-tight gradient-text">Terms and Conditions</h2>
          <p className="text-slate-400 font-medium">Welcome to TestTrail. By using our application, you agree to the following terms and conditions.</p>
        </div>

        <div className="space-y-6 text-slate-300">
          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">1. Use of Service</h3>
            <p>TestTrail provides online quizzes and educational content. You agree to use the app only for lawful purposes.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">2. User Account</h3>
            <p>You are responsible for maintaining the confidentiality of your account credentials. Any activity under your account is your responsibility.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">3. Payments and Refunds</h3>
            <p>All payments made for premium features are processed through secure third-party payment gateways. Payments are non-refundable unless required by law.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">4. Access to Premium Features</h3>
            <p>Premium features will be activated after successful payment. We reserve the right to modify or discontinue services at any time.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">5. Prohibited Activities</h3>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the app for illegal purposes</li>
              <li>Attempt to hack or misuse the system</li>
              <li>Share your account with others</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">6. Intellectual Property</h3>
            <p>All content, quizzes, and materials in TestTrail are owned by us and cannot be copied or redistributed without permission.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">7. Limitation of Liability</h3>
            <p>We are not responsible for any loss or damage resulting from the use of our app.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">8. Changes to Terms</h3>
            <p>We may update these terms at any time without prior notice.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-xl font-bold text-white">9. Contact Us</h3>
            <p>For any queries, contact us at:</p>
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

export default TermsAndConditions;
