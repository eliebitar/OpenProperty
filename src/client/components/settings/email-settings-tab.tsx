import { useState, useEffect } from "react";
import {
  Mail,
  Send,
  Server,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Info,
  ExternalLink,
  Eye,
  EyeOff,
  Zap,
  Clock,
  Check,
} from "lucide-react";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EmailSenderConfig, EmailLogEntry, EmailProvider } from "@/types";

export function EmailSettingsTab() {
  const { user } = useAuth();

  // Settings State
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<EmailProvider>("smtp");
  const [fromAddress, setFromAddress] = useState("noreply@openproperty.local");
  const [fromName, setFromName] = useState("OpenProperty");
  const [replyTo, setReplyTo] = useState("");

  // SMTP Settings
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  // API Key Settings
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // Status & Feedback
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Test Email State
  const [testRecipient, setTestRecipient] = useState(user?.email || "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    messageId?: string;
    error?: string;
    simulated?: boolean;
  } | null>(null);

  // Logs State
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await api<EmailSenderConfig>("GET", "/api/email/config");
      setEnabled(res.enabled);
      setProvider(res.provider || "smtp");
      setFromAddress(res.fromAddress || "noreply@openproperty.local");
      setFromName(res.fromName || "OpenProperty");
      setReplyTo(res.replyTo || "");
      setSmtpHost(res.smtpHost || "smtp.gmail.com");
      setSmtpPort(res.smtpPort || 465);
      setSmtpSecure(res.smtpSecure ?? true);
      setSmtpUser(res.smtpUser || "");
      setSmtpPass(res.smtpPass || "");
      setApiKey(res.apiKey || "");
    } catch (err) {
      console.warn("Failed to load email config:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      setLoadingLogs(true);
      const res = await api<{ logs: EmailLogEntry[] }>("GET", "/api/email/logs");
      setLogs(res.logs || []);
    } catch {
      /* ignore */
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchLogs();
  }, []);

  useEffect(() => {
    if (!testRecipient && user?.email) {
      setTestRecipient(user.email);
    }
  }, [user?.email, testRecipient]);

  // Presets
  const applyPreset = (preset: "gmail" | "outlook" | "resend" | "sendgrid" | "brevo") => {
    setTestResult(null);
    setSaveSuccess(false);

    if (preset === "gmail") {
      setProvider("smtp");
      setSmtpHost("smtp.gmail.com");
      setSmtpPort(465);
      setSmtpSecure(true);
      if (!fromAddress || fromAddress.includes("openproperty.local")) {
        setFromAddress("your-email@gmail.com");
      }
    } else if (preset === "outlook") {
      setProvider("smtp");
      setSmtpHost("smtp.office365.com");
      setSmtpPort(587);
      setSmtpSecure(false);
    } else if (preset === "resend") {
      setProvider("resend");
    } else if (preset === "sendgrid") {
      setProvider("sendgrid");
    } else if (preset === "brevo") {
      setProvider("brevo");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSaveError(null);
      setSaveSuccess(false);

      await api("PUT", "/api/email/config", {
        enabled,
        provider,
        fromAddress: fromAddress.trim(),
        fromName: fromName.trim(),
        replyTo: replyTo.trim() || undefined,
        smtpHost: smtpHost.trim(),
        smtpPort,
        smtpSecure,
        smtpUser: smtpUser.trim(),
        smtpPass: smtpPass.trim(),
        apiKey: apiKey.trim(),
      });

      setSaveSuccess(true);
      await fetchLogs();
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      setSaveError((err as Error).message || "Failed to save email configuration");
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testRecipient || !testRecipient.includes("@")) {
      setTestResult({ ok: false, error: "Please enter a valid recipient email address." });
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);

      const res = await api<{
        ok: boolean;
        messageId?: string;
        error?: string;
        simulated?: boolean;
      }>("POST", "/api/email/test", {
        to: testRecipient.trim(),
        provider,
        fromAddress: fromAddress.trim(),
        fromName: fromName.trim(),
        smtpHost: smtpHost.trim(),
        smtpPort,
        smtpSecure,
        smtpUser: smtpUser.trim(),
        smtpPass: smtpPass.trim(),
        apiKey: apiKey.trim(),
      });

      setTestResult(res);
      await fetchLogs();
    } catch (err) {
      setTestResult({ ok: false, error: (err as Error).message || "Failed to send test email" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Loading email settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview & Status Card */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">Outbound Email Sender</h2>
                <Badge
                  variant={enabled ? "default" : "outline"}
                  className={enabled ? "bg-emerald-600 text-white hover:bg-emerald-600 text-[10px]" : "text-[10px] text-muted-foreground"}
                >
                  {enabled ? "Active & Sending" : "Simulation Mode (Local)"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Configure SMTP credentials or transactional API keys to dispatch team member invitations and notifications.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <span>Enable Real Email Dispatch</span>
            </label>
          </div>
        </div>

        {!enabled && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
            <Info className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <strong>Simulation Mode:</strong> When disabled, invitations are logged to the console and recorded in the database without connecting to an external mail server. Turn on <em>"Enable Real Email Dispatch"</em> when ready to send real emails to your team.
            </div>
          </div>
        )}
      </Card>

      {/* Provider Quick Presets */}
      <Card className="p-4 bg-muted/20">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-xs font-semibold text-foreground">Quick Setup Presets:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={provider === "smtp" && smtpHost === "smtp.gmail.com" ? "default" : "outline"}
              className="h-7 text-xs px-2.5"
              onClick={() => applyPreset("gmail")}
            >
              Gmail SMTP
            </Button>
            <Button
              type="button"
              size="sm"
              variant={provider === "smtp" && smtpHost === "smtp.office365.com" ? "default" : "outline"}
              className="h-7 text-xs px-2.5"
              onClick={() => applyPreset("outlook")}
            >
              Outlook 365
            </Button>
            <Button
              type="button"
              size="sm"
              variant={provider === "resend" ? "default" : "outline"}
              className="h-7 text-xs px-2.5"
              onClick={() => applyPreset("resend")}
            >
              Resend
            </Button>
            <Button
              type="button"
              size="sm"
              variant={provider === "sendgrid" ? "default" : "outline"}
              className="h-7 text-xs px-2.5"
              onClick={() => applyPreset("sendgrid")}
            >
              SendGrid
            </Button>
            <Button
              type="button"
              size="sm"
              variant={provider === "brevo" ? "default" : "outline"}
              className="h-7 text-xs px-2.5"
              onClick={() => applyPreset("brevo")}
            >
              Brevo
            </Button>
          </div>
        </div>
      </Card>

      {/* Main Configuration Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <Card className="p-6 space-y-5">
          <div className="border-b pb-3">
            <h3 className="text-sm font-semibold text-foreground">Sender Identity & Service Provider</h3>
            <p className="text-xs text-muted-foreground">Choose your delivery mechanism and customize the From header.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="email-provider">Delivery Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as EmailProvider)}>
                <SelectTrigger id="email-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="smtp">Standard SMTP (Gmail, Outlook, Private Host)</SelectItem>
                  <SelectItem value="resend">Resend API (Recommended - Simple & Fast)</SelectItem>
                  <SelectItem value="sendgrid">Twilio SendGrid API</SelectItem>
                  <SelectItem value="brevo">Brevo / Sendinblue API</SelectItem>
                  <SelectItem value="postmark">Postmark API</SelectItem>
                  <SelectItem value="mailchannels">MailChannels API (Cloudflare Workers)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="from-address">From Email Address</Label>
              <Input
                id="from-address"
                type="email"
                placeholder="noreply@yourdomain.com"
                value={fromAddress}
                onChange={(e) => setFromAddress(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="from-name">From Display Name</Label>
              <Input
                id="from-name"
                placeholder="OpenProperty Portfolio"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reply-to">Reply-To Address (Optional)</Label>
              <Input
                id="reply-to"
                type="email"
                placeholder="support@yourdomain.com"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
              />
            </div>
          </div>

          {/* Conditional Provider Settings */}
          {provider === "smtp" ? (
            <div className="mt-4 rounded-xl border border-border/80 bg-muted/10 p-4 space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Server className="h-4 w-4 text-sky-500" />
                <span>SMTP Connection Details</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="smtp-host">SMTP Server Host</Label>
                  <Input
                    id="smtp-host"
                    placeholder="e.g. smtp.gmail.com"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    required={provider === "smtp"}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    placeholder="465"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(parseInt(e.target.value, 10) || 465)}
                    required={provider === "smtp"}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="smtp-secure"
                    checked={smtpSecure}
                    onChange={(e) => setSmtpSecure(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <Label htmlFor="smtp-secure" className="text-xs font-normal cursor-pointer">
                    Use SSL/TLS (Recommended for port 465; uncheck for port 587 STARTTLS)
                  </Label>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="smtp-user">SMTP Username / Email</Label>
                  <Input
                    id="smtp-user"
                    placeholder="e.g. user@gmail.com"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="smtp-pass">SMTP Password / App Password</Label>
                  <div className="relative">
                    <Input
                      id="smtp-pass"
                      type={showSmtpPass ? "text" : "password"}
                      placeholder="••••••••••••"
                      value={smtpPass}
                      onChange={(e) => setSmtpPass(e.target.value)}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSmtpPass(!showSmtpPass)}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      {showSmtpPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {smtpHost.includes("gmail.com") && (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  💡 <strong>Gmail Tip:</strong> Use your full Gmail address and a 16-character <em>Google App Password</em> (generated in Google Account &rarr; Security &rarr; 2-Step Verification &rarr; App Passwords), NOT your normal account password.
                </p>
              )}
            </div>
          ) : provider !== "mailchannels" ? (
            <div className="mt-4 rounded-xl border border-border/80 bg-muted/10 p-4 space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Key className="h-4 w-4 text-emerald-500" />
                <span>{provider.toUpperCase()} API Key</span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="api-key">API Key / Token</Label>
                <div className="relative">
                  <Input
                    id="api-key"
                    type={showApiKey ? "text" : "password"}
                    placeholder={
                      provider === "resend"
                        ? "re_123456789..."
                        : provider === "sendgrid"
                        ? "SG.123456789..."
                        : "Enter API Key"
                    }
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="pr-9 font-mono text-xs"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {saveError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Email sender configuration saved successfully!</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Configuration"}
            </Button>
          </div>
        </Card>
      </form>

      {/* Live Test Sender Card */}
      <Card className="p-6 space-y-4 border-border/80">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Send Test Verification Email
          </h3>
          <p className="text-xs text-muted-foreground">
            Verify that your active sender credentials connect cleanly and deliver to an inbox.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Input
              type="email"
              placeholder="recipient@example.com"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              className="text-xs h-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleTestEmail}
            disabled={testing || !testRecipient.trim()}
            className="shrink-0 h-9 text-xs gap-1.5"
          >
            {testing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Testing Connection…</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span>Send Test Email</span>
              </>
            )}
          </Button>
        </div>

        {testResult && (
          <div
            className={`rounded-lg p-3.5 text-xs border ${
              testResult.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {testResult.ok ? (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    {testResult.simulated
                      ? "Simulation Test Succeeded (Logged to server console)"
                      : "Test Email Delivered Successfully!"}
                  </p>
                  <p className="mt-0.5 text-[11px] opacity-90 font-mono">
                    Message ID: {testResult.messageId}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Failed to send test email</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed">{testResult.error}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Email Delivery Logs */}
      <Card className="overflow-hidden border-border/80">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Recent Email Delivery Logs</h3>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            onClick={fetchLogs}
            disabled={loadingLogs}
          >
            <RefreshCw className={`h-3 w-3 ${loadingLogs ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No outbound emails recorded yet. Send an invitation or run a test email above.
          </div>
        ) : (
          <div className="divide-y overflow-x-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 text-xs gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">{log.to_email}</span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 ${
                        log.status === "sent"
                          ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                          : log.status === "simulated"
                          ? "border-amber-500 text-amber-600 dark:text-amber-400"
                          : "border-destructive text-destructive"
                      }`}
                    >
                      {log.status.toUpperCase()}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">({log.provider})</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{log.subject}</p>
                  {log.error && <p className="text-[10px] text-destructive mt-0.5">{log.error}</p>}
                </div>
                <div className="shrink-0 text-[10px] text-muted-foreground font-mono">
                  {log.created_at}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
