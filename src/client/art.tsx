import type { ClassId } from "../shared/model";

export function Warrior({
  kind,
  color = "#a9c9bc",
  portrait = false,
  flip = false,
}: {
  kind: ClassId;
  color?: string;
  portrait?: boolean;
  flip?: boolean;
}) {
  const mage = kind === "mage",
    ranger = kind === "ranger",
    orc = kind === "berserker";
  return (
    <svg
      viewBox="0 0 120 150"
      role="img"
      aria-label={kind}
      className={`warrior ${portrait ? "portrait" : ""}`}
      style={{ color, transform: flip ? "scaleX(-1)" : undefined }}
    >
      <ellipse cx="60" cy="139" rx="35" ry="7" fill="#050b09" opacity=".55" />
      <path
        d="M38 65 Q18 94 25 132 L52 125 91 134 83 71Z"
        fill={mage ? "#495467" : ranger ? "#344f3d" : "#393f43"}
        stroke="#101e1b"
        strokeWidth="3"
      />
      <path
        d="M43 108 42 135 55 138 61 108M65 108 68 138 83 137 77 105"
        fill="#202c2a"
        stroke="#101e1b"
        strokeWidth="4"
      />
      <path
        d="M38 65 30 91 42 99 48 77M81 65 95 90 84 97 74 78"
        fill={orc ? "#7a9670" : "#9bada4"}
        stroke="#192925"
        strokeWidth="4"
      />
      <path
        d="M40 61 79 61 85 107 36 107Z"
        fill={orc ? "#594135" : "currentColor"}
        stroke="#182925"
        strokeWidth="4"
      />
      <path
        d="M45 66 59 83 77 66M43 94 78 94"
        fill="none"
        stroke="#182925"
        strokeWidth="4"
      />
      <path d="M48 101 47 115 74 115 73 101" fill="#443b2c" />
      <path d="M56 101 65 101 65 110 56 110Z" fill="#c2a365" />
      <path
        d="M44 34 77 34 80 54 69 68 51 63 41 50Z"
        fill={orc ? "#8ea47c" : "#cbb99b"}
        stroke="#172723"
        strokeWidth="3"
      />
      {mage ? (
        <>
          <path
            d="m33 37 25-33 15 28 12 9Z"
            fill="#64768a"
            stroke="#1c2d2c"
            strokeWidth="3"
          />
          <path d="m46 49 12 10 18-7-6 18-15 6Z" fill="#d6d0bb" />
        </>
      ) : ranger ? (
        <path
          d="M36 53Q28 11 64 16 91 18 87 57L72 35 43 39Z"
          fill="#415c47"
          stroke="#192e26"
          strokeWidth="4"
        />
      ) : orc ? (
        <>
          <path d="m42 39 3-16 11 4 10-8 12 10 4 13Z" fill="#393a32" />
          <path d="m48 57 3-9 4 11m15-3 3-10 4 8" fill="#e6d8ad" />
        </>
      ) : (
        <>
          <path
            d="M40 41 44 19 72 19 83 39 76 57 44 55Z"
            fill="#98aaa2"
            stroke="#1c2c29"
            strokeWidth="4"
          />
          <path d="m60 21 0 37M45 40h31" stroke="#273a34" strokeWidth="5" />
          <path d="m52 20 9-13 9 13" fill="#82978e" />
        </>
      )}
      {(mage || ranger || orc) && (
        <path d="M49 44h6m11 0h6" stroke="#192b23" strokeWidth="3" />
      )}
      {mage ? (
        <>
          <path d="m94 43-4 87" stroke="#987c51" strokeWidth="6" />
          <path
            d="m94 20 10 15-11 16-10-15Z"
            fill="#a9dccd"
            stroke="#d1f3d4"
            strokeWidth="3"
          />
          <circle cx="94" cy="35" r="20" fill="#9ce6c1" opacity=".12" />
        </>
      ) : ranger ? (
        <>
          <path
            d="M94 46q33 43-5 78"
            fill="none"
            stroke="#b89a62"
            strokeWidth="6"
          />
          <path d="m94 46-5 78" stroke="#e1d6b8" strokeWidth="1.5" />
          <path d="m76 90 36-4-7-3m7 3-7 5" stroke="#cfd6ba" strokeWidth="2" />
        </>
      ) : orc ? (
        <>
          <path d="m96 46-8 88" stroke="#97774f" strokeWidth="7" />
          <path
            d="M78 39q-9 19-3 32l23-9 11-17Z"
            fill="#9daaa1"
            stroke="#20322c"
            strokeWidth="3"
          />
        </>
      ) : (
        <>
          <path
            d="m92 40-2 51-6 15 12 1 0-15 3-51-4-11Z"
            fill="#d0dbcb"
            stroke="#2b4139"
            strokeWidth="2"
          />
          <path d="m80 94 25 2m-13 1-1 20" stroke="#b49b63" strokeWidth="5" />
          <path
            d="M20 74 46 72 49 103 35 117 19 102Z"
            fill="#4a6255"
            stroke="#afba9d"
            strokeWidth="3"
          />
          <path d="m33 79 1 29m-9-17 17-1" stroke="#b8bd95" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg viewBox="0 0 40 44" width="30" height="34" fill="none">
      <path
        d="m20 2 17 9v20L20 42 3 31V11Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="m11 29 9-18 9 18m-14-6h10M20 6v5m0 20v7"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    </svg>
  );
}
