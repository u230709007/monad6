import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Fingerprint,
  ShieldCheck,
  LayoutDashboard,
  Terminal,
  Users,
  Wallet,
  Clock,
  Send,
  Check,
  LogOut,
  Copy,
  ExternalLink,
  LockKeyhole,
  Activity,
  Layers,
  Scale,
  LoaderCircle,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { withMera, escrowAction, publicClient } from "./lib/mera";
import { abi } from "./lib/escrow-abi";
import { ChainConsole } from "./components/ChainConsole";
import { DeployEvent } from "./components/DeployEvent";
import { formatEther, type Address } from "viem";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";

type Config = {
  demo: boolean;
  contract: Address | null;
  stake: string;
  prize: string;
  network: `eip155:${string}`;
  price: string;
  asset: string;
  payTo: string;
  aiReady: boolean;
};
type User = {
  id: string;
  address: string;
  name: string;
  team: string;
  project: string;
  repo: string;
  baseline: string;
  joined: number;
  jury: boolean;
};
type Prompt = {
  id: string;
  prompt: string;
  answer: string;
  created: string;
  hash: string;
  mode: string;
};
type Entry = User & { promptCount: number; report: string | null };
const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "workspace", label: "Workspace", icon: Terminal },
  { id: "project", label: "Team & project", icon: Users },
  { id: "funds", label: "Stake & prizes", icon: Wallet },
  { id: "jury", label: "Jury review", icon: Scale },
];
export default function App() {
  const [page, setPage] = useState("overview"),
    [config, setConfig] = useState<Config>(),
    [user, setUser] = useState<User>(),
    [prompts, setPrompts] = useState<Prompt[]>([]),
    [token, setToken] = useState(sessionStorage.getItem("bp-token") || ""),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [login, setLogin] = useState(false),
    [prompt, setPrompt] = useState(""),
    [entries, setEntries] = useState<Entry[]>([]),
    [evidence, setEvidence] = useState(""),
    [balances, setBalances] = useState({ stake: "0", reward: "0" }),
    [appeal, setAppeal] = useState("");
  async function api(path: string, body?: unknown, auth = token) {
    const r = await fetch("/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await r
      .json()
      .catch(() => ({ error: `Request failed (${r.status})` }));
    if (!r.ok)
      throw Object.assign(new Error(data.error || "Request failed."), {
        status: r.status,
      });
    return data;
  }
  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }
  async function refresh(auth = token) {
    const u = await api("/me", undefined, auth);
    setUser(u);
    setPrompts(await api("/prompts", undefined, auth));
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = document.documentElement.style;
      s.setProperty("--mx", `${e.clientX}px`);
      s.setProperty("--my", `${e.clientY}px`);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  useEffect(() => {
    api("/config")
      .then(setConfig)
      .catch((e) => setNotice(e.message));
  }, []);
  useEffect(() => {
    if (token)
      refresh().catch((error) => {
        if (error.status === 401) {
          setToken("");
          setUser(undefined);
          sessionStorage.removeItem("bp-token");
        } else
          setNotice(
            "Server unreachable. Your session is kept; try refreshing.",
          );
      });
  }, [token]);
  useEffect(() => {
    if (page === "jury" && user?.jury)
      api("/jury")
        .then(setEntries)
        .catch((e) => setNotice(e.message));
    if (page === "funds" && user && config) {
      if (config.demo)
        setBalances({ stake: user.joined ? "1000" : "0", reward: "0" });
      else if (config.contract)
        Promise.all([
          publicClient.readContract({
            address: config.contract,
            abi,
            functionName: "stakes",
            args: [user.address as Address],
          }),
          publicClient.readContract({
            address: config.contract,
            abi,
            functionName: "rewards",
            args: [user.address as Address],
          }),
        ])
          .then(([s, r]) =>
            setBalances({ stake: formatEther(s), reward: formatEther(r) }),
          )
          .catch((e) => setNotice(e.message));
    }
  }, [page, user, config]);
  async function signIn(kind: "create" | "login" | "demo") {
    await run("Signing in", async () => {
      let result;
      if (kind === "demo") result = await api("/auth/demo", {});
      else
        result = await withMera(kind === "create", async (account) => {
          const c = await api("/auth/challenge", {});
          const signature = await account.signMessage({ message: c.message });
          return api("/auth/verify", {
            id: c.id,
            address: account.address,
            signature,
          });
        });
      sessionStorage.setItem("bp-token", result.token);
      setUser(undefined);
      setPrompts([]);
      setEntries([]);
      setEvidence("");
      setToken(result.token);
      setLogin(false);
    });
  }
  async function join() {
    if (!user) {
      setLogin(true);
      return;
    }
    await run("Joining", async () => {
      if (!user.project) {
        setPage("project");
        throw new Error("Save your team and project before joining.");
      }
      if (!config?.demo) {
        if (!config?.contract)
          throw new Error("Contract address not configured.");
        const alreadyJoined = await publicClient.readContract({
          address: config.contract,
          abi,
          functionName: "joined",
          args: [user.address as Address],
        });
        if (!alreadyJoined)
          await escrowAction("join", user.address, config.contract);
      }
      await api("/join", {});
      await refresh();
      setNotice(
        config?.demo
          ? "Demo join recorded. No real MON locked."
          : "1,000 MON stake locked.",
      );
    });
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      setLogin(true);
      return;
    }
    await run("Thinking", async () => {
      let result;
      if (config?.demo) result = await api("/chat", { prompt });
      else {
        if (!config) throw new Error("Loading config.");
        result = await withMera(false, async (account) => {
          if (account.address.toLowerCase() !== user.address.toLowerCase())
            throw new Error("Select the passkey you signed in with.");
          const client = new x402Client().register(
            config.network,
            new ExactEvmScheme(account),
          );
          client.onBeforePaymentCreation(
            async ({ selectedRequirements: r }) => {
              if (
                r.network !== config.network ||
                r.asset.toLowerCase() !== config.asset.toLowerCase() ||
                r.payTo.toLowerCase() !== config.payTo.toLowerCase() ||
                BigInt(r.amount) > BigInt(config.price)
              )
                throw new Error("Payment does not match the allowed limits.");
            },
          );
          const paid = wrapFetchWithPayment(fetch, client);
          const r = await paid("/api/chat", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ prompt }),
          });
          const data = await r.json();
          if (!r.ok)
            throw new Error(data.error || "Payment or AI request failed.");
          return data;
        });
      }
      setPrompts((p) => [...p, result]);
      setPrompt("");
    });
  }
  const date = (v: string) =>
    new Date(v).toLocaleString("en-US", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-label">HACKATHON WORKSPACE</div>
        <nav>
          {nav
            .filter((n) => n.id !== "jury" || !user || user.jury)
            .map((n) => (
              <button
                key={n.id}
                className={page === n.id ? "nav-item active" : "nav-item"}
                onClick={() => setPage(n.id)}
              >
                <n.icon size={19} />
                {n.label}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="network-card">
            <span className="monad-logo">M</span>
            <div>
              Monad Testnet<small>Prize & stake network</small>
            </div>
            <span className="status-dot" />
          </div>
          <p>
            Accounts by Mera.
            <br />
            Security by Monad.
          </p>
          <button
            className="profile"
            onClick={() =>
              user
                ? run("Signing out", async () => {
                    await api("/auth/logout", {});
                    sessionStorage.removeItem("bp-token");
                    setToken("");
                    setUser(undefined);
                    setPrompts([]);
                  })
                : setLogin(true)
            }
          >
            <span className="avatar">
              {user ? (
                user.name.slice(0, 2).toUpperCase()
              ) : (
                <Fingerprint size={20} />
              )}
            </span>
            <span>
              {user?.name || "Sign in"}
              <small>{user?.team || "Connect with passkey"}</small>
            </span>
            {user ? <LogOut size={16} /> : <ArrowRight size={16} />}
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="mode-badge">
              {!config
                ? "CONNECTING"
                : config.demo
                  ? "DEMO"
                  : "MONAD TESTNET"}
            </span>
            <button
              className="button small secondary"
              onClick={() => setLogin(true)}
            >
              <Fingerprint size={16} />
              {user ? "Switch account" : "Sign in with passkey"}
            </button>
          </div>
        </header>
        <main>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                aria-label="Dismiss"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {page === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">IDEA TO PROOF</div>
                  <h1>Build. Log. Prove.</h1>
                  <p>
                    Focus on your project. Your build journey is logged here.
                  </p>
                </div>
                <span className="edition">
                  SEASON 01 <span>↗</span>
                </span>
              </div>
              <section className="event-card">
                <div className="event-content">
                  <span className="pill">
                    {config?.demo ? "DEMO EVENT" : "TESTNET EVENT"}{" "}
                    <span>•</span> BUILDPROOF
                  </span>
                  <h2>
                    Monad
                    <br />
                    Builders Hackathon
                  </h2>
                  <p>
                    Turn your idea into a working product.
                    <br />
                    Transparent process. Earned rewards.
                  </p>
                  <div className="hero-actions">
                    <button
                      className="button primary"
                      disabled={!!busy || !!user?.joined}
                      onClick={join}
                    >
                      {user?.joined ? (
                        <Check size={18} />
                      ) : (
                        <ArrowUpRight size={18} />
                      )}{" "}
                      {user?.joined ? "Joined" : "Join hackathon"}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setPage("funds")}
                    >
                      View rules <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
                <div className="event-prize">
                  <div className="orb">
                    <Layers size={64} strokeWidth={1.2} />
                  </div>
                  <span>TOTAL PRIZE POOL</span>
                  <strong>
                    10,000 <em>MON</em>
                  </strong>
                  <div className="prize-foot">
                    <LockKeyhole size={14} />
                    {config?.demo
                      ? "Demo amount · no real funds"
                      : "Pre-funded prize contract"}
                  </div>
                </div>
              </section>
              <div className="stats-grid">
                <Stat
                  label="Stake"
                  value="1,000"
                  suffix="MON"
                  icon={LockKeyhole}
                  detail="Per person · locked during the event"
                />
                <Stat
                  label="Build logs"
                  value={String(prompts.length).padStart(2, "0")}
                  suffix="prompt"
                  icon={Terminal}
                  detail="Timestamped router logs"
                />
                <Stat
                  label="Project status"
                  value={user?.joined ? "Joined" : "Setting up"}
                  suffix=""
                  icon={Activity}
                  detail={user?.project || "Define your team and project"}
                />
              </div>
              <div className="lower-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h3>Build log</h3>
                    <button
                      className="text-button"
                      onClick={() => setPage("workspace")}
                    >
                      Workspace <ArrowUpRight size={16} />
                    </button>
                  </div>
                  {prompts.length ? (
                    prompts
                      .slice(-3)
                      .reverse()
                      .map((p) => (
                        <div className="activity-row" key={p.id}>
                          <span className="activity-icon">
                            <Terminal size={17} />
                          </span>
                          <div>
                            <strong>{p.prompt.slice(0, 80)}</strong>
                            <small>
                              {date(p.created)} ·{" "}
                              {p.mode === "demo"
                                ? "Demo log"
                                : "Router log"}
                            </small>
                          </div>
                          <ShieldCheck size={17} />
                        </div>
                      ))
                  ) : (
                    <div className="empty-state">
                      <span className="empty-icon">
                        <Terminal size={27} />
                      </span>
                      <h4>Start here.</h4>
                      <p>
                        Prompts you send in the workspace
                        <br />
                        build your project log.
                      </p>
                      <button
                        className="button secondary"
                        onClick={() => setPage("workspace")}
                      >
                        Start building <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </section>
                <section className="panel steps-panel">
                  <div className="panel-heading">
                    <h3>Getting started</h3>
                    <span className="muted">
                      {Number(!!user) +
                        Number(!!user?.project) +
                        Number(!!user?.joined)}
                      /3
                    </span>
                  </div>
                  {[
                    {
                      title: "Create account",
                      text: "Secure sign-in with a Mera passkey.",
                      done: !!user,
                      action: () => setLogin(true),
                    },
                    {
                      title: "Set up your team",
                      text: "Add your project and baseline commit.",
                      done: !!user?.project,
                      action: () => setPage("project"),
                    },
                    {
                      title: "Lock your stake",
                      text: "Reserve your spot with 1,000 MON.",
                      done: !!user?.joined,
                      action: join,
                    },
                  ].map((s, i) => (
                    <button className="step" key={s.title} onClick={s.action}>
                      <span
                        className={s.done ? "step-number done" : "step-number"}
                      >
                        {s.done ? (
                          <Check size={15} />
                        ) : (
                          String(i + 1).padStart(2, "0")
                        )}
                      </span>
                      <span>
                        <strong>{s.title}</strong>
                        <small>{s.text}</small>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                  <div className="quiet-note">
                    <ShieldCheck size={17} />
                    <span>
                      AI findings assist the jury.
                      <br />
                      Penalties are decided by review only.
                    </span>
                  </div>
                </section>
              </div>
            </>
          )}
          {page === "workspace" && (
            <>
              <Heading
                eyebrow="PROMPT ROUTER"
                title="Workspace"
                text="Every request is a new log entry for your project."
              />
              <div className="workspace-grid">
                <section className="panel chat-panel">
                  <div className="panel-heading">
                    <h3>
                      <span className="status-dot" /> Build assistant
                    </h3>
                    <span className="pill neutral">
                      {config?.demo && !config?.aiReady
                        ? "DEMO REPLIES"
                        : config?.demo
                          ? "ANTHROPIC"
                          : "ANTHROPIC · x402"}
                    </span>
                  </div>
                  <div className="messages">
                    {!prompts.length && (
                      <div className="chat-welcome">
                        <Terminal size={36} />
                        <h2>What are we building today?</h2>
                        <p>
                          Refine your idea, design your architecture, or debug together.
                        </p>
                        <div className="suggestions">
                          {[
                            "Scope my project's MVP",
                            "Design a contract architecture on Monad",
                            "Build the first user flow",
                          ].map((s) => (
                            <button key={s} onClick={() => setPrompt(s)}>
                              {s}
                              <ArrowUpRight size={15} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {prompts.map((p) => (
                      <div className="exchange" key={p.id}>
                        <div className="message user-message">
                          <small>YOU ·  {date(p.created)}</small>
                          <p>{p.prompt}</p>
                        </div>
                        <div className="message assistant-message">
                          <small>
                            <Layers size={14} /> BUILDPROOF{" "}
                            {p.mode === "demo" ? "· DEMO" : ""}
                          </small>
                          <p>{p.answer}</p>
                          <span className="hash">
                            <ShieldCheck size={12} /> Log: {" "}
                            {p.hash.slice(0, 16)}…
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <form className="composer" onSubmit={send}>
                    <textarea
                      aria-label="Prompt"
                      placeholder="Describe your idea or ask a question…"
                      value={prompt}
                      maxLength={12000}
                      onChange={(e) => setPrompt(e.target.value)}
                    />
                    <div>
                      <small>
                        {config?.demo
                          ? "Demo · no payment"
                          : `Call limit: ${config?.price} token units · passkey approval`}
                      </small>
                      <button
                        className="button primary"
                        disabled={!!busy || !prompt.trim()}
                      >
                        <Send size={17} />
                        {busy || "Send"}
                      </button>
                    </div>
                  </form>
                </section>
                <aside className="panel context-panel">
                  <span className="eyebrow">PROJECT CONTEXT</span>
                  <h3>{user?.project || "No project yet"}</h3>
                  <p>{user?.team || "Create your team on the Project page."}</p>
                  <hr />
                  <h4>Request path</h4>
                  {[
                    "Mera account",
                    "x402 payment check",
                    "BuildProof router",
                    "Anthropic reply",
                    "Build log entry",
                  ].map((s, i) => (
                    <div className="route-step" key={s}>
                      <span>{i + 1}</span>
                      {s}
                    </div>
                  ))}
                  <hr />
                  <small>
                    Prompts and replies are logged and may be reviewed by the jury. Do not share passwords, API keys, or personal data.
                  </small>
                </aside>
              </div>
            </>
          )}
          {page === "project" && (
            <>
              <Heading
                eyebrow="BUILD TOGETHER"
                title="Team & project"
                text="Save your starting point. Make progress visible."
              />
              <section className="panel form-panel">
                {!user ? (
                  <LoginPrompt open={() => setLogin(true)} />
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      run("Saving", async () => {
                        await api("/project", data);
                        await refresh();
                        setNotice("Project saved.");
                      });
                    }}
                  >
                    <div className="form-grid">
                      <label>
                        Name
                        <input
                          name="name"
                          defaultValue={user.name}
                          required
                          maxLength={100}
                        />
                      </label>
                      <label>
                        Team name
                        <input
                          name="team"
                          defaultValue={user.team}
                          placeholder="e.g. Block Studio"
                          required
                          maxLength={100}
                        />
                      </label>
                      <label className="full">
                        Project name
                        <input
                          name="project"
                          defaultValue={user.project}
                          placeholder="What are you building?"
                          required
                          maxLength={150}
                        />
                      </label>
                      <label className="full">
                        GitHub repo
                        <input
                          name="repo"
                          defaultValue={user.repo}
                          placeholder="https://github.com/takim/proje"
                          readOnly={!!user.joined}
                        />
                      </label>
                      <label className="full">
                        Baseline commit SHA
                        <input
                          name="baseline"
                          defaultValue={user.baseline}
                          placeholder="40-character commit SHA"
                          readOnly={!!user.joined}
                        />
                        <small>
                          Baseline is locked after joining. Self-declared; the jury verifies the repo.
                        </small>
                      </label>
                    </div>
                    <button className="button primary" disabled={!!busy}>
                      Save project <Check size={17} />
                    </button>
                  </form>
                )}
              </section>
            </>
          )}
          {page === "funds" && (
            <>
              <Heading
                eyebrow="MONAD ESCROW"
                title="Your stake, secured"
                text="Prizes and stakes are held separately."
              />
              <div className="stats-grid">
                <Stat
                  label="Event prize"
                  value="10,000"
                  suffix="MON"
                  icon={Wallet}
                  detail={
                    config?.demo
                      ? "Demo event"
                      : "Contract funding required"
                  }
                />
                <Stat
                  label="Your locked stake"
                  value={balances.stake}
                  suffix="MON"
                  icon={LockKeyhole}
                  detail={
                    config?.demo
                      ? "Demo balance · not real assets"
                      : "Monad testnet contract balance"
                  }
                />
                <Stat
                  label="Your awarded prize"
                  value={balances.reward}
                  suffix="MON"
                  icon={ShieldCheck}
                  detail="Based on final results"
                />
              </div>
              <div className="lower-grid">
                <section className="panel padded">
                  <h3>Joining & refunds</h3>
                  <a
                    className="text-button"
                    href="/api/rules"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Full event rules <ExternalLink size={14} />
                  </a>
                  <p>
                    1,000 MON is locked per person. Participants who follow the rules can get their stake back once results are final.
                  </p>
                  <div className="rule-line">
                    <Check size={18} /> AI usage fees do not come out of your stake.
                  </div>
                  <div className="rule-line">
                    <Clock size={18} /> The refund deadline prevents indefinite locks.
                  </div>
                  <div className="rule-line">
                    <Scale size={18} /> Slashing needs a jury majority.
                  </div>
                  <div className="button-row">
                    <button
                      className="button primary"
                      disabled={!!busy || !!user?.joined}
                      onClick={join}
                    >
                      {user?.joined
                        ? "Joined"
                        : "Join with 1,000 MON"}
                    </button>
                    <button
                      className="button secondary"
                      disabled={!!busy || !user}
                      onClick={() =>
                        run("Checking refund", async () => {
                          if (config?.demo)
                            throw new Error(
                              "Demo event in progress. No real funds to withdraw.",
                            );
                          if (!config?.contract || !user)
                            throw new Error(
                              "Sign in and configure the contract first.",
                            );
                          const hash = await escrowAction(
                            "claim",
                            user.address,
                            config.contract,
                          );
                          setNotice("Refund confirmed:  " + hash);
                        })
                      }
                    >
                      Claim refund / prize
                    </button>
                  </div>
                  {user && !user.address.startsWith("demo") && (
                    <button
                      className="address"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(user.address)
                          .then(() => setNotice("Address copied."))
                      }
                    >
                      <Copy size={14} />
                      {user.address}
                    </button>
                  )}
                  {config?.contract && (
                    <a
                      className="text-button"
                      href={`https://testnet.monadscan.com/address/${config.contract}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View contract <ExternalLink size={14} />
                    </a>
                  )}
                </section>
                <section className="panel padded">
                  <h3>Review & appeal</h3>
                  <p>
                    An AI report is not a verdict. The jury reviews findings; participants can submit explanations and evidence.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      run("Submitting appeal", async () => {
                        await api("/appeal", { content: appeal });
                        setAppeal("");
                        setNotice(
                          "Your statement was added to the jury file. The on-chain appeal must be filed separately.",
                        );
                      });
                    }}
                  >
                    <label>
                      Your statement and evidence links
                      <textarea
                        value={appeal}
                        onChange={(e) => setAppeal(e.target.value)}
                        minLength={20}
                        maxLength={8000}
                        required
                        placeholder="Share the evidence you want reviewed…"
                      />
                    </label>
                    <button
                      className="button secondary"
                      disabled={!!busy || !user}
                    >
                      Send statement to jury <ArrowUpRight size={16} />
                    </button>
                  </form>
                  <small>
                    This form adds a statement to the file; it does not change the contract's appeal window.
                  </small>
                </section>
              </div>
            </>
          )}
          {page === "jury" && (
            <>
              <Heading
                eyebrow="EVIDENCE-BASED REVIEW"
                title="Jury desk"
                text="Review build logs. Weigh findings in context."
              />
              {!user ? (
                <section className="panel">
                  <LoginPrompt open={() => setLogin(true)} />
                </section>
              ) : !user.jury ? (
                <div className="notice">
                  This account is not a juror.
                </div>
              ) : (
                <>
                  <div className="notice">
                    {config?.demo ? "Demo jury view.  " : ""}AI analysis never penalizes automatically. On-chain decisions require juror signatures.
                  </div>
                  <section className="panel">
                    {entries.length ? (
                      entries.map((entry) => (
                        <div className="jury-row" key={entry.id}>
                          <div className="avatar">
                            {entry.team.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="jury-detail">
                            <h3>{entry.project}</h3>
                            <p>
                              {entry.team} · {entry.promptCount} logs
                            </p>
                            {entry.repo && (
                              <a
                                href={entry.repo}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View repo ↗
                              </a>
                            )}
                          </div>
                          <button
                            className="button secondary"
                            disabled={!!busy}
                            onClick={() =>
                              run("Loading logs", async () => {
                                const data = await api(
                                  `/jury/${encodeURIComponent(entry.id)}/evidence`,
                                );
                                setEvidence(JSON.stringify(data, null, 2));
                              })
                            }
                          > Logs </button>
                          <button
                            className="button primary"
                            disabled={!!busy || entry.promptCount === 0}
                            onClick={() =>
                              run("Generating report", async () => {
                                const data = await api(
                                  `/jury/${encodeURIComponent(entry.id)}/analyze`,
                                  {},
                                );
                                setEvidence(data.content);
                                setEntries(await api("/jury"));
                              })
                            }
                          >
                            Generate report <ArrowUpRight size={16} />
                          </button>
                          {entry.report && (
                            <p className="report-preview">{entry.report}</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="empty-state">
                        <Users size={30} />
                        <h4>No participants yet.</h4>
                        <p>Projects that join will appear here.</p>
                      </div>
                    )}
                  </section>
                  {evidence && (
                    <section className="panel padded evidence">
                      <div className="panel-heading">
                        <h3>Review file</h3>
                        <button
                          className="text-button"
                          onClick={() => {
                            const blob = new Blob([evidence], {
                              type: "text/plain;charset=utf-8",
                            });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = "buildproof-evidence.txt";
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Download file <ArrowUpRight size={16} />
                        </button>
                      </div>
                      <pre>{evidence}</pre>
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {page === "funds" && user && config && (
            <ChainConsole
              address={user.address}
              contract={config.contract}
              demo={config.demo}
            />
          )}
          {page === "funds" && user && config && !config.contract && (
            <DeployEvent address={user.address} demo={config.demo} />
          )}
          <footer>
            <span>
              <Layers size={14} /> BUILDPROOF
            </span>
            <span>
              Mera <span>×</span> x402 <span>×</span> Monad
            </span>
            <span>Every good project has a story.</span>
          </footer>
        </main>
      </div>
      <Dialog.Root open={login} onOpenChange={setLogin}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog">
            <span className="empty-icon">
              <Fingerprint size={32} />
            </span>
            <Dialog.Title>You hold the key.</Dialog.Title>
            <Dialog.Description>
              Create an account with a Mera passkey or return to yours. Your private key never leaves your device.
            </Dialog.Description>
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() => signIn("create")}
            >
              Create passkey <ArrowRight size={18} />
            </button>
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => signIn("login")}
            >
              Use existing passkey
            </button>
            {config?.demo && (
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() => signIn("demo")}
              >
                Explore with demo account →
              </button>
            )}
            {busy && <p>{busy}</p>}
            {notice && <p role="alert">{notice}</p>}
            <small>
              Requires a browser with passkey PRF support. The demo account creates no real wallet.
            </small>
            <Dialog.Close className="dialog-close" aria-label="Close">
              ×
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {busy && (
        <div className="busy-indicator" role="status">
          <LoaderCircle size={18} className="spin" />
          {busy}
        </div>
      )}
    </div>
  );
}
function Heading({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}
function LoginPrompt({ open }: { open: () => void }) {
  return (
    <div className="empty-state">
      <Fingerprint size={32} />
      <h4>Join the workspace.</h4>
      <p>Sign in to continue.</p>
      <button className="button primary" onClick={open}>
        Sign in with passkey
      </button>
    </div>
  );
}
function Stat({
  label,
  value,
  suffix,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string;
  suffix: string;
  icon: typeof Wallet;
  detail: string;
}) {
  return (
    <section className="stat">
      <div>
        <span>{label}</span>
        <Icon size={19} />
      </div>
      <strong>
        {value} <small>{suffix}</small>
      </strong>
      <p>{detail}</p>
    </section>
  );
}
