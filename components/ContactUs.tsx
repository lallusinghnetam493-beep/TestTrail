import React from 'react';
import { motion } from 'motion/react';
import { Mail, Clock, MessageSquare } from 'lucide-react';

interface ContactUsProps {
  onBack: () => void;
}

const ContactUs: React.FC<ContactUsProps> = ({ onBack }) => {
  return (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto min-h-screen">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-10 rounded-[3rem] space-y-10 border-white/10 shadow-2xl"
      >
        <div className="space-y-4 text-center">
          <div className="inline-flex p-4 bg-indigo-500/10 rounded-3xl text-indigo-400 border border-indigo-500/20 mb-4">
            <MessageSquare size={40} />
          </div>
          <h2 className="text-4xl font-black tracking-tight gradient-text">Contact Us</h2>
          <p className="text-slate-400 font-medium max-w-xl mx-auto">
            If you have any questions, feedback, or support requests, feel free to contact us.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass p-8 rounded-3xl border-white/5 space-y-4 flex flex-col items-center text-center">
            <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400">
              <Mail size={24} />
            </div>
            <h3 className="font-bold text-lg">Email Us</h3>
            <p className="text-slate-400 text-sm">Send us an email anytime</p>
            <a 
              href="mailto:support@testtril.com" 
              className="text-indigo-400 font-bold hover:underline text-lg"
            >
              support@testtril.com
            </a>
          </div>

          <div className="glass p-8 rounded-3xl border-white/5 space-y-4 flex flex-col items-center text-center">
            <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-400">
              <Clock size={24} />
            </div>
            <h3 className="font-bold text-lg">Response Time</h3>
            <p className="text-slate-400 text-sm">We value your time</p>
            <p className="text-slate-200 font-medium">
              We will try to respond within 24–48 hours.
            </p>
          </div>
        </div>

        <div className="text-center space-y-6 pt-6">
          <p className="text-slate-400 font-medium italic">
            Thank you for using Testtril.
          </p>
          
          <div className="pt-6 border-t border-white/5">
            <button 
              onClick={onBack}
              className="px-8 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all border border-white/10"
            >
              Back to Home
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ContactUs;
