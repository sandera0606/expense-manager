import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FBF7EE',
          borderRadius: 34,
        }}
      >
        <svg
          width="180"
          height="180"
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M 11 50 Q 26 34 40 26"
            fill="none"
            stroke="#3A2F18"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.32"
          />
          <circle
            cx="42"
            cy="28"
            r="14"
            fill="#EEB238"
            stroke="#3A2F18"
            strokeWidth="3"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
