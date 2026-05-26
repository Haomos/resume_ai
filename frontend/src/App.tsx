import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './shared/Layout'
import { Settings } from './shared/Settings'
import { SeekerHome } from './modes/seeker/SeekerHome'
import { SeekerJobs } from './modes/seeker/SeekerJobs'
import { SeekerJobList } from './modes/seeker/SeekerJobList'
import { SeekerUpload } from './modes/seeker/SeekerUpload'
import { SeekerAnalyze } from './modes/seeker/SeekerAnalyze'
import { SeekerResult } from './modes/seeker/SeekerResult'
import { SeekerHistory } from './modes/seeker/SeekerHistory'
import { SeekerEditor } from './modes/seeker/editor'
import { SeekerResumes } from './modes/seeker/SeekerResumes'
import { SeekerPoolImport } from './modes/seeker/SeekerPoolImport'
import { RecruiterHome } from './modes/recruiter/RecruiterHome'
import { RecruiterJobs } from './modes/recruiter/RecruiterJobs'
import { RecruiterJobList } from './modes/recruiter/RecruiterJobList'
import { RecruiterScore } from './modes/recruiter/RecruiterScore'
import { RecruiterLeaderboard } from './modes/recruiter/RecruiterLeaderboard'
import { RecruiterBatchList } from './modes/recruiter/RecruiterBatchList'
import { useMode } from './hooks/useMode'
import { useAuth } from './context/AuthContext'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

function ModeRedirect() {
  const { mode } = useMode()
  return <Navigate to={`/${mode}/home`} replace />
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0e1a]">
        <div className="text-sm text-slate-400">加载中…</div>
      </div>
    )
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="seeker">
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<SeekerHome />} />
          <Route path="upload" element={<SeekerUpload />} />
          <Route path="jobs" element={<SeekerJobs />} />
          <Route path="jobs/manage" element={<SeekerJobList />} />
          <Route path="analyze" element={<SeekerAnalyze />} />
          <Route path="result/:id" element={<SeekerResult />} />
          <Route path="history" element={<SeekerHistory />} />
          <Route path="pool" element={<SeekerEditor poolMode />} />
          <Route path="pool/import" element={<SeekerPoolImport />} />
          <Route path="resumes" element={<SeekerResumes />} />
          <Route path="resumes/:id" element={<SeekerEditor />} />
          <Route path="editor" element={<Navigate to="/seeker/pool" replace />} />
          <Route path="editor/:id" element={<Navigate to="/seeker/pool" replace />} />
        </Route>

        <Route path="recruiter">
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<RecruiterHome />} />
          <Route path="jobs" element={<RecruiterJobs />} />
          <Route path="jobs/manage" element={<RecruiterJobList />} />
          <Route path="upload" element={<SeekerUpload />} />
          <Route path="pool" element={<SeekerEditor />} />
          <Route path="editor/:id" element={<SeekerEditor />} />
          <Route path="score" element={<RecruiterScore />} />
          <Route path="leaderboard" element={<RecruiterBatchList />} />
          <Route path="leaderboard/:batchId" element={<RecruiterLeaderboard />} />
        </Route>

        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<ModeRedirect />} />
      </Route>
    </Routes>
  )
}
