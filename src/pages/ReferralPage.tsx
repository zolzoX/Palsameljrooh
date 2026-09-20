import { useEffect, useState, useCallback } from "react";
import { Gift, Plus, Trash2, ExternalLink, Link2, Edit3, Check, X, TrendingUp, Copy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { LoadingState, EmptyState } from "@/components/States";

interface ReferralLink {
  id: string;
  exchange_name: string;
  label: string | null;
  referral_url: string;
  is_active: boolean;
  created_at: string;
}

export default function ReferralPage() {
  const [links, setLinks] = useState<ReferralLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newLink, setNewLink] = useState({ exchange_name: "", label: "", referral_url: "" });
  const [editLink, setEditLink] = useState({ exchange_name: "", label: "", referral_url: "", is_active: true });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    const { data } = await supabase.from("referral_links").select("*").order("created_at", { ascending: false });
    if (data) setLinks(data as ReferralLink[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const addLink = async () => {
    if (!newLink.exchange_name || !newLink.referral_url) return;
    await supabase.from("referral_links").insert({
      exchange_name: newLink.exchange_name,
      label: newLink.label || null,
      referral_url: newLink.referral_url,
    });
    setNewLink({ exchange_name: "", label: "", referral_url: "" });
    setShowAdd(false);
    fetchLinks();
  };

  const deleteLink = async (id: string) => {
    await supabase.from("referral_links").delete().eq("id", id);
    fetchLinks();
  };

  const saveEdit = async (id: string) => {
    await supabase.from("referral_links").update({
      exchange_name: editLink.exchange_name,
      label: editLink.label || null,
      referral_url: editLink.referral_url,
      is_active: editLink.is_active,
    }).eq("id", id);
    setEditing(null);
    fetchLinks();
  };

  const startEdit = (link: ReferralLink) => {
    setEditing(link.id);
    setEditLink({
      exchange_name: link.exchange_name,
      label: link.label ?? "",
      referral_url: link.referral_url,
      is_active: link.is_active,
    });
  };

  const copyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) return <LoadingState message="Loading referral links..." />;

  const activeCount = links.filter((l) => l.is_active).length;
  const exchangeCount = new Set(links.map((l) => l.exchange_name.toLowerCase())).size;

  return (
    <div className="p-6 sm:p-8 space-y-8 animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center flex-shrink-0 ring-1 ring-cyan-500/20">
            <Gift className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Referral Program</h3>
            <p className="text-sm text-slate-500">Manage referral links — auto-embedded in Telegram signals</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Add Link
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{links.length}</p>
              <p className="text-xs text-slate-500">Total Links</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{activeCount}</p>
              <p className="text-xs text-slate-500">Active</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-5 col-span-2 md:col-span-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <span className="text-lg font-bold text-amber-400">{exchangeCount}</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{exchangeCount}</p>
              <p className="text-xs text-slate-500">Exchanges</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="glass-card p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
            <Link2 className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-white">How Referral Links Work</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Add referral links for any exchange (Binance, Bybit, Coinbase, etc.). When the signal engine sends a Telegram notification, it automatically replaces plain exchange URLs with your referral link. Add as many as you need.
            </p>
          </div>
        </div>
      </div>

      {/* Add New Link Form */}
      {showAdd && (
        <div className="glass-card p-6 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800/60">
            <Plus className="w-4 h-4 text-cyan-400" />
            <h4 className="text-sm font-semibold text-white">Add New Referral Link</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 font-medium">Exchange Name</label>
              <input
                type="text"
                placeholder="e.g. Binance"
                value={newLink.exchange_name}
                onChange={(e) => setNewLink({ ...newLink, exchange_name: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 font-medium">Label (optional)</label>
              <input
                type="text"
                placeholder="e.g. 10% off fees"
                value={newLink.label}
                onChange={(e) => setNewLink({ ...newLink, label: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 font-medium">Referral URL</label>
              <input
                type="text"
                placeholder="https://..."
                value={newLink.referral_url}
                onChange={(e) => setNewLink({ ...newLink, referral_url: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40 transition-colors"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={addLink}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-sm font-semibold hover:bg-cyan-500/25 transition-all"
            >
              <Check className="w-4 h-4" /> Save Link
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-slate-400 text-sm font-medium hover:text-white hover:bg-slate-800/40 transition-all"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Links Grid */}
      {links.length === 0 ? (
        <EmptyState message="No referral links yet. Add your exchange referral links and they'll be automatically embedded in Telegram signal messages." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {links.map((link) => (
            <div
              key={link.id}
              className={`glass-card p-6 hover:border-cyan-500/20 transition-all duration-300 group ${editing === link.id ? "ring-1 ring-cyan-500/30" : ""}`}
            >
              {editing === link.id ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800/60">
                    <Edit3 className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-sm font-semibold text-white">Edit Link</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500 font-medium">Exchange</label>
                      <input
                        type="text"
                        value={editLink.exchange_name}
                        onChange={(e) => setEditLink({ ...editLink, exchange_name: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40 transition-colors"
                        placeholder="Exchange"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-500 font-medium">Label</label>
                      <input
                        type="text"
                        value={editLink.label}
                        onChange={(e) => setEditLink({ ...editLink, label: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40 transition-colors"
                        placeholder="Label"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 font-medium">Referral URL</label>
                    <input
                      type="text"
                      value={editLink.referral_url}
                      onChange={(e) => setEditLink({ ...editLink, referral_url: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 text-sm text-white outline-none focus:border-cyan-500/40 transition-colors"
                      placeholder="Referral URL"
                    />
                  </div>
                  <label className="flex items-center gap-2.5 text-sm text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editLink.is_active}
                      onChange={(e) => setEditLink({ ...editLink, is_active: e.target.checked })}
                      className="w-4 h-4 accent-cyan-500 rounded"
                    />
                    <span className="font-medium">Active</span>
                  </label>
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => saveEdit(link.id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-sm font-semibold hover:bg-cyan-500/25 transition-all"
                    >
                      <Check className="w-3.5 h-3.5" /> Save Changes
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-slate-400 text-sm font-medium hover:text-white hover:bg-slate-800/40 transition-all"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/15 to-blue-600/15 flex items-center justify-center ring-1 ring-cyan-500/10">
                        <Gift className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-white">{link.exchange_name}</p>
                        {link.label && <p className="text-xs text-slate-500 mt-0.5">{link.label}</p>}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg ${
                        link.is_active
                          ? "bg-green-500/10 text-green-400 ring-1 ring-green-500/20"
                          : "bg-slate-700/30 text-slate-500 ring-1 ring-slate-700/30"
                      }`}
                    >
                      {link.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* URL Display */}
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-900/40 border border-slate-800/40">
                    <ExternalLink className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <a
                      href={link.referral_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 truncate text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                    >
                      {link.referral_url}
                    </a>
                    <button
                      onClick={() => copyUrl(link.id, link.referral_url)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-slate-800/60 transition-all flex-shrink-0"
                      title="Copy URL"
                    >
                      {copiedId === link.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-3 border-t border-slate-800/40">
                    <button
                      onClick={() => startEdit(link)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-slate-400 text-xs font-medium hover:text-cyan-400 hover:bg-cyan-500/5 transition-all"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => deleteLink(link.id)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-slate-400 text-xs font-medium hover:text-red-400 hover:bg-red-500/5 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
