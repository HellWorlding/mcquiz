import { AuthForm } from "@/domains/auth/components/AuthForm";

export const metadata = { title: "회원가입" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
