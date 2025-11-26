// src/router/index.jsx
import React from "react";
import { Routes, Route } from "react-router-dom";

import RootLayout from "../layouts/RootLayout.jsx";
import SessionLayout from "../layouts/SessionLayout.jsx";

import LandingPage from "../pages/Landing/LandingPage.jsx";
import NotFoundPage from "../pages/NotFound/NotFoundPage.jsx";

import HrWorkshopPage from "../pages/Hr/HrWorkshopPage.jsx";

import SessionConsentPage from "../pages/Session/SessionConsentPage.jsx";
import SessionDeclinedPage from "../pages/Session/SessionDeclinedPage.jsx";
import SessionInterviewPage from "../pages/Session/SessionInterviewPage.jsx";
import SessionReportPage from "../pages/Session/SessionReportPage.jsx";

function AppRouter() {
  return (
    <Routes>
      {/* Публичная часть + HR-часть под общим layout'ом */}
      <Route element={<RootLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/hr/workshop" element={<HrWorkshopPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Интервью по приглашению (отдельный layout без маркетинговых блоков) */}
      <Route path="/session/:token" element={<SessionLayout />}>
        {/* /session/:token → экран согласия/правил */}
        <Route index element={<SessionConsentPage />} />
        {/* /session/:token/declined → отказ от условий */}
        <Route path="declined" element={<SessionDeclinedPage />} />
        {/* /session/:token/interview → само интервью (IDE + таймер) */}
        <Route path="interview" element={<SessionInterviewPage />} />
        {/* /session/:token/report → итоговый отчёт/статистика */}
        <Route path="report" element={<SessionReportPage />} />
      </Route>
    </Routes>
  );
}

export default AppRouter;