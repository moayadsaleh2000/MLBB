import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useEffect } from "react";
import { io } from "socket.io-client"; // تأكد إنك عامل npm install socket.io-client
import "./App.css";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Squad from "./pages/Squad";
import AllTeams from "./pages/AllTeams";
import MatchSchedule from "./pages/MatchSchedule";
import Matches from "./pages/Matches";

// 1. تحديد رابط الـ API بشكل ديناميكي
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// 2. إعداد السوكيت ليكون متاحاً في التطبيق
export const socket = io(API_URL, {
  transports: ["websocket"],
  autoConnect: true,
});

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  const manualExit = sessionStorage.getItem("manualExit") === "1";
  if (token && !manualExit) return <Navigate to="/home" replace />;
  return children;
};

function App() {
  useEffect(() => {
    // منطق الربط عند تشغيل التطبيق
    socket.on("connect", () => {
      console.log("✅ Connected to Server via Socket:", socket.id);
    });

    return () => {
      socket.off("connect");
    };
  }, []);

  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/squad"
          element={
            <ProtectedRoute>
              <Squad />
            </ProtectedRoute>
          }
        />
        <Route
          path="/matchmaking"
          element={
            <ProtectedRoute>
              <AllTeams />
            </ProtectedRoute>
          }
        />

        <Route
          path="/match-schedule/:id"
          element={
            <ProtectedRoute>
              <MatchSchedule />
            </ProtectedRoute>
          }
        />

        <Route
          path="/matches"
          element={
            <ProtectedRoute>
              <Matches />
            </ProtectedRoute>
          }
        />

        <Route
          path="/matches/:id"
          element={
            <ProtectedRoute>
              <Matches />
            </ProtectedRoute>
          }
        />
        {/* --------------------- */}

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
