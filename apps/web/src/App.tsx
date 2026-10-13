import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { StaffGate } from './auth/StaffGate'
import { AppShell } from './components/AppShell'
import { HomePage } from './pages/HomePage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage'
import { AdminCoursesPage } from './pages/admin/AdminCoursesPage'
import { AdminClassesPage } from './pages/admin/AdminClassesPage'
import { AdminPeoplePage } from './pages/admin/AdminPeoplePage'
import { AdminEnrollmentsPage } from './pages/admin/AdminEnrollmentsPage'
import { AdminMetricsPage } from './pages/admin/AdminMetricsPage'
import { AdminAnalysisPage } from './pages/admin/AdminAnalysisPage'
import { AdminOpsPage } from './pages/admin/AdminOpsPage'
import { AdminAuditPage } from './pages/admin/AdminAuditPage'
import { AdminResourcesPage } from './pages/admin/AdminResourcesPage'
import { AdminTestAudioPage } from './pages/admin/AdminTestAudioPage'
import { AdminPackageTestsPage } from './pages/admin/AdminPackageTestsPage'
import { TeacherLayout } from './pages/teacher/TeacherLayout'
import { TeacherOverviewPage } from './pages/teacher/TeacherOverviewPage'
import { TeacherSessionPage } from './pages/teacher/TeacherSessionPage'
import { TeacherObservePage } from './pages/teacher/TeacherObservePage'
import { TeacherAnalysisPage } from './pages/teacher/TeacherAnalysisPage'
import { TeacherArchivePage } from './pages/teacher/TeacherArchivePage'
import { TeacherClassesPage } from './pages/teacher/TeacherClassesPage'
import { TeacherLearnerProfilePage } from './pages/teacher/TeacherLearnerProfilePage'
import { TeacherTestsPage } from './pages/teacher/TeacherTestsPage'
import { TeacherTestSetupPage } from './pages/teacher/TeacherTestSetupPage'
import { TeacherTestRunPage } from './pages/teacher/TeacherTestRunPage'
import { TeacherTestAnalysisPage } from './pages/teacher/TeacherTestAnalysisPage'
import { TeacherLearnerTestResultsPage } from './pages/teacher/TeacherLearnerTestResultsPage'
import { AppStateProvider } from './state/AppState'
import { GuestEvaluationPage } from './pages/guest/GuestEvaluationPage'

export default function App() {
  return (
    <AuthProvider>
      <AppStateProvider>
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/eval" element={<GuestEvaluationPage />} />

              <Route
                path="/admin"
                element={
                  <StaffGate role="admin">
                    <AdminLayout />
                  </StaffGate>
                }
              >
                <Route index element={<AdminOverviewPage />} />
                <Route path="ops" element={<AdminOpsPage />} />
                <Route path="attendance" element={<Navigate to="/admin/ops" replace />} />
                <Route path="audit" element={<AdminAuditPage />} />
                <Route path="courses" element={<AdminCoursesPage />} />
                <Route path="classes" element={<AdminClassesPage />} />
                <Route path="people" element={<AdminPeoplePage />} />
                <Route path="enrollments" element={<AdminEnrollmentsPage />} />
                <Route path="analysis" element={<AdminAnalysisPage />} />
                <Route path="metrics" element={<AdminMetricsPage />} />
                <Route path="package-tests" element={<AdminPackageTestsPage />} />
                <Route path="resources" element={<AdminResourcesPage />} />
                <Route path="resources/audio" element={<AdminTestAudioPage />} />
              </Route>

              <Route path="/teacher/observe" element={<TeacherObservePage />} />

              <Route
                path="/teacher"
                element={
                  <StaffGate role="teacher">
                    <TeacherLayout />
                  </StaffGate>
                }
              >
                <Route index element={<TeacherOverviewPage />} />
                <Route path="classes" element={<TeacherClassesPage />} />
                <Route path="tests" element={<TeacherTestsPage />} />
                <Route path="tests/analysis/:assignmentId" element={<TeacherTestAnalysisPage />} />
                <Route
                  path="tests/:assignmentId/sections/:sectionId/setup"
                  element={<TeacherTestSetupPage />}
                />
                <Route path="test-runs/:runId" element={<TeacherTestRunPage />} />
                <Route
                  path="learner/:learnerId/tests"
                  element={<TeacherLearnerTestResultsPage />}
                />
                <Route path="learner/:learnerId" element={<TeacherLearnerProfilePage />} />
                <Route path="session" element={<TeacherSessionPage />} />
                <Route path="archive" element={<TeacherArchivePage />} />
                <Route path="analysis" element={<TeacherAnalysisPage />} />
                <Route path="progress" element={<Navigate to="/teacher/analysis" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </AppStateProvider>
    </AuthProvider>
  )
}
