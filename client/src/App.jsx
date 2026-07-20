import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Layout from './components/Layout';
import { Spinner } from './components/Glass';
import Login from './pages/Login';
import OBLogin from './pages/OBLogin';
import Signup from './pages/Signup';
import OAuthCallback from './pages/OAuthCallback';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import Complaints from './pages/Complaints';
import Dues from './pages/Dues';
import Notices from './pages/Notices';
import Classifieds from './pages/Classifieds';
import Approvals from './pages/Approvals';
import Admin from './pages/Admin';
import LostFound from './pages/LostFound';
import Events from './pages/Events';
import Gallery from './pages/Gallery';
import Settings from './pages/Settings';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/ob/login" element={<OBLogin />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route path="/" element={<Home />} />
            <Route path="/complaints" element={<Complaints />} />
            <Route path="/dues" element={<Dues />} />
            <Route path="/notices" element={<Notices />} />
            <Route
              path="/classifieds"
              element={
                <RoleRoute roles={['admin', 'office_bearer']}>
                  <Classifieds />
                </RoleRoute>
              }
            />
            <Route
              path="/approvals"
              element={
                <RoleRoute roles={['admin']}>
                  <Approvals />
                </RoleRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <RoleRoute roles={['admin']}>
                  <Admin />
                </RoleRoute>
              }
            />
            <Route path="/lost-found" element={<LostFound />} />
            <Route path="/events" element={<Events />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
