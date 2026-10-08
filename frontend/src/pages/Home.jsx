import { Link } from 'react-router-dom';
import Icon from '../components/Icons';

const log = [
  ['$', 'hostly deploy shop.zip'],
  ['ok', 'deployment #12 queued, slot free'],
  ['ok', 'fork: build worker pid 4412, parent pid 4398'],
  ['ok', 'docker build node:20-slim'],
  ['ok', 'npm install && npm run build'],
  ['ok', 'docker run, 128 MB memory, 0.25 cpu'],
  ['live', 'http://shop.hostly.localhost:8080'],
];

const steps = [
  ['Add your project', 'Drop a zip file or paste a public GitHub link. Tell us the build command, the start command and the port.'],
  ['Hostly builds it', 'A worker process is forked for your deployment. It gets the code, writes a Dockerfile and builds the image.'],
  ['It runs in a container', 'Your app starts in its own Docker container with a memory and CPU limit that fits your account.'],
  ['Open it and watch it', 'Visit your address, read the logs, follow the traffic and see what your app uses.'],
];

const bars = [
  [14, 4], [18, 5], [12, 3], [22, 8], [30, 9], [26, 6], [34, 12], [28, 7], [38, 10], [31, 8], [24, 5], [20, 6],
];

function Terminal() {
  return (
    <div className="hm-term" role="img" aria-label="Example of a deployment log with the worker process id and the final address">
      <div className="hm-term-bar">
        <i /><i /><i />
        <span>deployment log</span>
      </div>
      <ol>
        {log.map(([kind, text], i) => (
          <li key={text} style={{ '--i': i }} className={kind}>
            <b>{kind === '$' ? '$' : kind === 'live' ? 'live' : 'ok'}</b>
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Traffic() {
  const top = 40;
  return (
    <svg className="hm-bars" viewBox="0 0 156 56" aria-hidden="true">
      {bars.map(([get, post], i) => (
        <g key={i}>
          <rect x={i * 13 + 1} y={top - get} width="9" height={get} rx="1.5" fill="var(--series-1)" />
          <rect x={i * 13 + 1} y={top - get - post - 1} width="9" height={post} rx="1.5" fill="var(--series-2)" />
        </g>
      ))}
    </svg>
  );
}

export default function Home() {
  return (
    <div className="hm">
      <header className="hm-nav">
        <Link to="/" className="brand">Hostly</Link>
        <nav>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#inside">Under the hood</a>
        </nav>
        <Link to="/login" className="hm-login">Log in</Link>
        <Link to="/login?mode=signup" className="btn">Sign up</Link>
      </header>

      <section className="hm-hero">
        <div className="hm-hero-copy">
          <h1>Push your code. Get a live address.</h1>
          <p className="hm-lead">
            Hostly builds your project in a Docker container, gives it a web address and shows what it uses:
            memory, CPU, storage and every request that comes in.
          </p>
          <div className="hm-cta">
            <Link to="/login?mode=signup" className="btn big">Start deploying</Link>
            <Link to="/login" className="btn ghost big">Log in</Link>
          </div>
          <p className="muted small">Names like <code>shop.hostly.localhost</code> are free. If shop is taken you get shop2.</p>
        </div>
        <Terminal />
      </section>

      <section className="hm-section" id="features">
        <h2>Everything a small app needs to go live</h2>
        <p className="hm-sub">No servers to set up, no ports to remember.</p>

        <div className="hm-bento">
          <article className="hm-tile span4">
            <span className="hm-ic"><Icon name="upload" /></span>
            <h3>Deploy from GitHub or a zip file</h3>
            <p>Paste a public repository or drag in a zip. Pick Node.js 20, Node.js 22 or Python 3.12, add your build and start commands and press deploy. Cancel a build at any time.</p>
            <div className="hm-chips"><span>GitHub link</span><span>Zip upload</span><span>Deploy hook</span></div>
          </article>

          <article className="hm-tile span2">
            <span className="hm-ic"><Icon name="globe" /></span>
            <h3>A web address from day one</h3>
            <p>Rename it whenever you like or add your own domains.</p>
            <div className="hm-domains">
              <code>shop.hostly.localhost</code>
              <code className="dim">shop2.hostly.localhost</code>
              <code className="dim">www.myshop.test</code>
            </div>
          </article>

          <article className="hm-tile span2">
            <span className="hm-ic"><Icon name="chart" /></span>
            <h3>See every request</h3>
            <p>GET and POST charts and a live console.</p>
            <Traffic />
            <div className="hm-key"><span><i className="a" />GET</span><span><i className="b" />POST</span></div>
          </article>

          <article className="hm-tile span4">
            <span className="hm-ic"><Icon name="gauge" /></span>
            <h3>One budget, shared fairly</h3>
            <p>Every account gets 0.5 CPU, 512 MB of memory and 1 GB of storage. All your projects share it, and a round robin scheduler gives each project its turn so a busy one cannot block the rest.</p>
            <div className="hm-meters">
              {[['CPU', '0.5 cores', 50], ['Memory', '512 MB', 62], ['Storage', '1 GB', 28]].map(([name, cap, pct]) => (
                <div key={name}>
                  <div className="hm-meter-head"><span>{name}</span><span className="muted">{cap}</span></div>
                  <div className="hm-track"><i style={{ width: `${pct}%` }} /></div>
                </div>
              ))}
            </div>
          </article>

          <article className="hm-tile span3">
            <span className="hm-ic"><Icon name="lock" /></span>
            <h3>Environment variables</h3>
            <p>Add secrets per project. Values stay hidden and reach both the build and the running app.</p>
            <div className="hm-env">
              <div><code>DATABASE_URL</code><code>••••••••••</code></div>
              <div><code>API_KEY</code><code>••••••••••</code></div>
            </div>
          </article>

          <article className="hm-tile span3">
            <span className="hm-ic"><Icon name="rewind" /></span>
            <h3>Go back when something breaks</h3>
            <p>The last two builds are kept. Roll back in one click or restart from the saved image.</p>
            <div className="hm-deploys">
              <div><i className="live" />Deployment #12<span className="muted">live</span></div>
              <div><i />Deployment #11<span className="muted">roll back</span></div>
            </div>
          </article>
        </div>
      </section>

      <section className="hm-section" id="how">
        <h2>From code to a running app in four steps</h2>
        <ol className="hm-steps">
          {steps.map(([title, text], i) => (
            <li key={title}>
              <span className="hm-num">{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="hm-section" id="inside">
        <div className="hm-inside">
          <div>
            <h2>Built to show how an operating system works</h2>
            <p className="hm-sub left">Hostly is a student project, so the process side is not hidden. Open the Processes page and watch it live.</p>
            <ul className="hm-points">
              <li><Icon name="check" size={18} /><span>Every deployment <strong>forks a child process</strong>, and you can see its PID and its parent&apos;s PID.</span></li>
              <li><Icon name="check" size={18} /><span>A <strong>monitor thread</strong> reads docker stats for memory, CPU and disk.</span></li>
              <li><Icon name="check" size={18} /><span>Builds are stopped and cleaned up with <strong>signals</strong> and timeouts.</span></li>
              <li><Icon name="check" size={18} /><span>Requests are shared with a <strong>round robin scheduler</strong> and a time quantum.</span></li>
              <li><Icon name="check" size={18} /><span>PostgreSQL keeps all state, with plain SQL and no ORM.</span></li>
            </ul>
          </div>
          <div className="hm-tree" role="img" aria-label="Process tree: the server is the parent, a build worker is its child, git and docker are the worker's children">
            <div className="row"><b>4398</b><span>hostly server</span><em>parent</em></div>
            <div className="row l1"><b>thread</b><span>resource monitor</span><em>polls docker</em></div>
            <div className="row l1"><b>4412</b><span>build worker #12</span><em>forked child</em></div>
            <div className="row l2"><b>4413</b><span>git clone</span><em>spawned</em></div>
            <div className="row l2"><b>4420</b><span>docker build</span><em>spawned</em></div>
          </div>
        </div>
      </section>

      <section className="hm-final">
        <h2>Ready to put something online?</h2>
        <p>Create an account, add a project and deploy it in a few minutes.</p>
        <div className="hm-cta center">
          <Link to="/login?mode=signup" className="btn big">Create an account</Link>
          <Link to="/login" className="btn ghost big">Log in</Link>
        </div>
      </section>

      <footer className="hm-foot">
        <span className="brand">Hostly</span>
        <span className="muted small">A web hosting platform for local development and learning. Not for production use.</span>
      </footer>
    </div>
  );
}
