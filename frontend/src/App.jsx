import { Routes, Route, Navigate, NavLink, Link, useNavigate } from 'react-router-dom';
import { token } from './api';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewProject from './pages/NewProject';
import Project from './pages/Project';
import Usage from './pages/Usage';
import System from './pages/System';

function Layout({ children }) {
  const navigate = useNavigate();
  const logout = () => {
    token.clear();
    navigate('/login');
  };
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">Hostly</Link>
        <nav>
          <NavLink to="/" end>Projects</NavLink>
          <NavLink to="/usage">Usage</NavLink>
          <NavLink to="/system">Processes</NavLink>
        </nav>
        <button className="link" onClick={logout}>Log out</button>
      </header>
      <main className="page">{children}</main>
    </>
  );
}

function Private({ children }) {
  return token.get() ? <Layout>{children}</Layout> : <Navigate to="/login" replace />;
}

function Index() {
  return token.get() ? <Layout><Dashboard /></Layout> : <Home />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Index />} />
      <Route path="/new" element={<Private><NewProject /></Private>} />
      <Route path="/projects/:id" element={<Private><Project /></Private>} />
      <Route path="/usage" element={<Private><Usage /></Private>} />
      <Route path="/system" element={<Private><System /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
