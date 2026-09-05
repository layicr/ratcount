/** 首页：P0 欢迎占位，后续由仪表盘接管 / Home placeholder */
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg,#e6f7f5 0%,#f4f6f8 55%,#eef2ff 100%)",
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #e6e8eb",
          borderRadius: 18,
          padding: "40px 48px",
          textAlign: "center",
          boxShadow: "0 6px 24px rgba(0,0,0,.06)",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "var(--brand)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            fontWeight: 700,
            margin: "0 auto 14px",
          }}
        >
          简
        </div>
        <h1 style={{ fontSize: 22, margin: "0 0 6px" }}>ratcount</h1>
        <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>
          个人 / 家庭 / 生意 记账 · P0 脚手架已就绪
        </p>
      </div>
    </main>
  );
}
