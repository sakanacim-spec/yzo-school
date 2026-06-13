// ============================================================
// SKELETON LOADERS — Perceived Performance Components
// ============================================================
import React from 'react';

export const SkeletonLine: React.FC<{ width?: string; height?: number }> = ({ width = '100%', height = 14 }) => (
  <div className="skeleton skeleton-text" style={{ width, height, borderRadius: 6 }} />
);

export const SkeletonTitle: React.FC<{ width?: string }> = ({ width = '60%' }) => (
  <div className="skeleton" style={{ width, height: 22, borderRadius: 8 }} />
);

export const SkeletonAvatar: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <div className="skeleton" style={{ width: size, height: size, borderRadius: 10, flexShrink: 0 }} />
);

export const SkeletonCard: React.FC<{ height?: number }> = ({ height = 120 }) => (
  <div className="skeleton" style={{ height, borderRadius: 16 }} />
);

export const SkeletonKPI: React.FC = () => (
  <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <SkeletonLine width="45%" />
      <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }} />
    </div>
    <div className="skeleton" style={{ width: '70%', height: 32, borderRadius: 8 }} />
    <SkeletonLine width="55%" height={12} />
  </div>
);

export const SkeletonRow: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
    <SkeletonAvatar size={36} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <SkeletonLine width="40%" />
      <SkeletonLine width="25%" height={11} />
    </div>
    <SkeletonLine width="80px" height={11} />
  </div>
);

export const DashboardSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
    {/* Header card skeleton */}
    <div className="card" style={{ padding: 28 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="skeleton" style={{ width: 120, height: 24, borderRadius: 100 }} />
        <div className="skeleton" style={{ width: '55%', height: 36, borderRadius: 10 }} />
        <SkeletonLine width="80%" height={14} />
      </div>
    </div>

    {/* KPI row */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
      {[...Array(5)].map((_, i) => <SkeletonKPI key={i} />)}
    </div>

    {/* Charts row */}
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
      <SkeletonCard height={280} />
      <SkeletonCard height={280} />
    </div>

    {/* Table skeleton */}
    <div className="card">
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
        <SkeletonTitle />
      </div>
      {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
    </div>
  </div>
);

export const PageSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <SkeletonTitle width="30%" />
      <div className="skeleton" style={{ width: 120, height: 36, borderRadius: 10 }} />
    </div>
    <div className="card">
      {[...Array(8)].map((_, i) => <SkeletonRow key={i} />)}
    </div>
  </div>
);
