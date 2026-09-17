'use client';

// Shimmer animation via CSS keyframes injected once
if (typeof window !== 'undefined' &&
    !document.getElementById('shimmer-style')) {
  const style = document.createElement('style');
  style.id = 'shimmer-style';
  style.textContent = `
    @keyframes shimmer {
      0% { background-position: -1000px 0; }
      100% { background-position: 1000px 0; }
    }
    .shimmer-box {
      background: linear-gradient(
        90deg,
        #f0f0f0 25%,
        #e0e0e0 50%,
        #f0f0f0 75%
      );
      background-size: 1000px 100%;
      animation: shimmer 1.5s infinite linear;
      border-radius: 6px;
    }
  `;
  document.head.appendChild(style);
}

export function ShimmerBox({ width = '100%', height = 16,
                              radius = 6, style = {} }) {
  return (
    <div
      className="shimmer-box"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

export function ShimmerCard({ rows = 3, style = {} }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb',
      borderRadius: 12, padding: '16px 20px',
      marginBottom: 12, ...style
    }}>
      {Array.from({ length: rows }).map((_, i) => (
        <ShimmerBox
          key={i}
          height={i === 0 ? 14 : 10}
          width={i === 0 ? '60%' : `${80 - i * 10}%`}
          style={{ marginBottom: i < rows - 1 ? 10 : 0 }}
        />
      ))}
    </div>
  );
}

export function ShimmerRow({ cols = 4 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: 12, marginBottom: 12,
    }}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} style={{
          background: '#fff', border: '1px solid #e5e7eb',
          borderRadius: 12, padding: '16px 20px',
        }}>
          <ShimmerBox height={10} width="50%"
                      style={{ marginBottom: 10 }} />
          <ShimmerBox height={24} width="70%" />
        </div>
      ))}
    </div>
  );
}

export function ShimmerTable({ rows = 5 }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', gap: 16, padding: '12px 16px',
          borderBottom: i < rows - 1 ? '1px solid #f3f4f6' : 'none',
          alignItems: 'center',
        }}>
          <ShimmerBox width={32} height={32} radius={50} />
          <div style={{ flex: 1 }}>
            <ShimmerBox height={12} width="40%"
                        style={{ marginBottom: 6 }} />
            <ShimmerBox height={10} width="25%" />
          </div>
          <ShimmerBox height={20} width={60} radius={20} />
          <ShimmerBox height={12} width={80} />
        </div>
      ))}
    </div>
  );
}
