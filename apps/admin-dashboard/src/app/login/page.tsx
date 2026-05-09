import { AdminLoginForm } from "../../components/admin-login-form";

export default function LoginPage() {
  return (
    <main className="container" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <AdminLoginForm />
    </main>
  );
}
