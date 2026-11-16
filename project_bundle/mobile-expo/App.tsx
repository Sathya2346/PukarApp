import React, { useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import "./src/i18n";
import { COLORS } from "./src/theme/tokens";
import { mobileApi } from "./src/services/api";

export default function App() {
  const { t, i18n } = useTranslation();
  const [role, setRole] = useState<"citizen" | "officer" | "admin">("citizen");
  const [email, setEmail] = useState("user@email.com");
  const [password, setPassword] = useState("Password@123");
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async () => {
    try {
      await mobileApi.loginWithEmailOtp(email, password, role);
      setOtpStep(true);
      setMessage("");
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  const handleVerify = async () => {
    try {
      await mobileApi.verifyEmailOtp(email, role, otp);
      setMessage("Authenticated via Email OTP");
    } catch (e: any) {
      setMessage(e.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor={COLORS.crimson} barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("appName")}</Text>
        <TouchableOpacity
          onPress={() => i18n.changeLanguage(i18n.language === "ta" ? "en" : "ta")}
          style={styles.langBtn}
        >
          <Text style={styles.langBtnText}>{i18n.language === "ta" ? "EN" : "தமிழ்"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{otpStep ? t("emailOtpTitle") : t("selectRole")}</Text>
        {!otpStep ? (
          <>
            <View style={styles.roleRow}>
              {(["citizen", "officer", "admin"] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRole(r)}
                  style={[styles.roleBtn, role === r && styles.roleBtnActive]}
                >
                  <Text style={role === r ? styles.roleTextActive : styles.roleText}>{t(r)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" />
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
              <Text style={styles.primaryBtnText}>{t("verify")}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.muted}>{t("emailOtpSubtitle")}</Text>
            <TextInput style={styles.input} value={otp} onChangeText={setOtp} placeholder="6-digit Email OTP" keyboardType="number-pad" maxLength={6} />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleVerify}>
              <Text style={styles.primaryBtnText}>{t("verify")}</Text>
            </TouchableOpacity>
          </>
        )}
        {!!message && <Text style={styles.message}>{message}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: { backgroundColor: COLORS.crimson, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  langBtn: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  langBtnText: { color: "#fff", fontWeight: "600" },
  card: { margin: 16, padding: 20, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 12 },
  roleRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  roleBtn: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: "center" },
  roleBtnActive: { backgroundColor: "#FEF2F2", borderColor: COLORS.crimson },
  roleText: { color: COLORS.textMuted, fontSize: 12, fontWeight: "600" },
  roleTextActive: { color: COLORS.crimson, fontSize: 12, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, marginBottom: 12 },
  primaryBtn: { backgroundColor: COLORS.crimson, padding: 14, borderRadius: 10, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
  muted: { color: COLORS.textMuted, marginBottom: 12 },
  message: { marginTop: 12, color: COLORS.crimson, fontWeight: "600" },
});
