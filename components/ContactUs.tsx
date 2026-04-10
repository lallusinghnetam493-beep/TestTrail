import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Clock, MessageSquare, Send, User, MessageCircle } from 'lucide-react';

interface ContactUsProps {
  onBack: () => void;
}

const ContactUs: React.FC<ContactUsProps> = ({ onBack }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      setFormData({ name: '', email: '', subject: '', message: '' });
    }, 1500);
  };

  return (
    <div className="pt-32 pb-20 px-6 max-w-6xl mx-auto min-h-screen">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-12"
      >
        {/* Header Section */}
        <div className="text-center space-y-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex p-4 bg-indigo-500/10 rounded-3xl text-indigo-400 border border-indigo-500/20 mb-4"
          >
            <MessageSquare size={40} />
          </motion.div>
          <h2 className="text-5xl font-black tracking-tight gradient-text">Get in Touch</h2>
          <p className="text-slate-400 font-medium max-w-2xl mx-auto text-lg">
            Have a question or need assistance? Our team is here to help you succeed in your journey.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Contact Info Cards */}
          <div className="lg:col-span-1 space-y-6">
            <div className="glass p-8 rounded-[2rem] border-white/5 space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-indigo-500/10 transition-colors"></div>
              <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 w-fit">
                <Mail size={24} />
              </div>
              <h3 className="font-bold text-xl">Email Support</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                For general inquiries and technical support, drop us an email anytime.
              </p>
              <a 
                href="mailto:support@testtril.com" 
                className="block text-indigo-400 font-bold hover:text-indigo-300 text-lg transition-colors"
              >
                support@testtril.com
              </a>
            </div>

            <div className="glass p-8 rounded-[2rem] border-white/5 space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-purple-500/10 transition-colors"></div>
              <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-400 w-fit">
                <Clock size={24} />
              </div>
              <h3 className="font-bold text-xl">Response Time</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                We strive to provide quick resolutions to all your queries.
              </p>
              <p className="text-slate-200 font-bold text-lg">
                24 – 48 Business Hours
              </p>
            </div>

            <div className="glass p-8 rounded-[2rem] border-white/5 space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-emerald-500/10 transition-colors"></div>
              <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 w-fit">
                <MessageCircle size={24} />
              </div>
              <h3 className="font-bold text-xl">Community</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Join our community for updates and peer support.
              </p>
              <button className="text-emerald-400 font-bold hover:text-emerald-300 transition-colors">
                Join Telegram Channel →
              </button>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <div className="glass p-10 rounded-[2.5rem] border-white/10 shadow-2xl relative">
              {submitted ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-20 text-center space-y-6"
                >
                  <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                    <Send size={40} />
                  </div>
                  <h3 className="text-3xl font-bold">Message Sent!</h3>
                  <p className="text-slate-400 max-w-sm mx-auto">
                    Thank you for reaching out. We've received your message and will get back to you soon.
                  </p>
                  <button 
                    onClick={() => setSubmitted(false)}
                    className="text-indigo-400 font-bold hover:underline"
                  >
                    Send another message
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-400 ml-1 flex items-center gap-2">
                        <User size={14} /> Full Name
                      </label>
                      <input 
                        required
                        type="text" 
                        placeholder="John Doe"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-400 ml-1 flex items-center gap-2">
                        <Mail size={14} /> Email Address
                      </label>
                      <input 
                        required
                        type="email" 
                        placeholder="john@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-400 ml-1">Subject</label>
                    <input 
                      required
                      type="text" 
                      placeholder="How can we help?"
                      value={formData.subject}
                      onChange={(e) => setFormData({...formData, subject: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-400 ml-1">Message</label>
                    <textarea 
                      required
                      rows={5}
                      placeholder="Tell us more about your query..."
                      value={formData.message}
                      onChange={(e) => setFormData({...formData, message: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-6 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none"
                    ></textarea>
                  </div>

                  <button 
                    disabled={isSubmitting}
                    type="submit"
                    className="w-full py-5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 rounded-2xl font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3 group"
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <>
                        Send Message
                        <Send size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="text-center pt-8">
          <button 
            onClick={onBack}
            className="px-10 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all border border-white/10 text-slate-400 hover:text-white"
          >
            ← Back to Home
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ContactUs;
