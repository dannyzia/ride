import { useState, useRef } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";
import CustomButton from "@/components/CustomButton";

const { width: SCREEN_W } = Dimensions.get("window");

type OnboardingStep =
  | "welcome"
  | "nid"
  | "license"
  | "vehicle_reg"
  | "driver_photo"
  | "vehicle_photos"
  | "review"
  | "submitting"
  | "pending";

interface UploadState {
  uri: string | null;
  path: string | null;
  url: string | null;
  uploading: boolean;
}

const STEPS: { key: Exclude<OnboardingStep, "submitting" | "pending">; label: string }[] = [
  { key: "welcome", label: "Welcome" },
  { key: "nid", label: "NID" },
  { key: "license", label: "License" },
  { key: "vehicle_reg", label: "Registration" },
  { key: "driver_photo", label: "Your Photo" },
  { key: "vehicle_photos", label: "Vehicle" },
  { key: "review", label: "Review" },
];

export default function DriverOnboarding() {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  // Upload states
  const [nidFront, setNidFront] = useState<UploadState>({ uri: null, path: null, url: null, uploading: false });
  const [nidBack, setNidBack] = useState<UploadState>({ uri: null, path: null, url: null, uploading: false });
  const [licenseFront, setLicenseFront] = useState<UploadState>({ uri: null, path: null, url: null, uploading: false });
  const [licenseBack, setLicenseBack] = useState<UploadState>({ uri: null, path: null, url: null, uploading: false });
  const [vehicleReg, setVehicleReg] = useState<UploadState>({ uri: null, path: null, url: null, uploading: false });
  const [driverPhoto, setDriverPhoto] = useState<UploadState>({ uri: null, path: null, url: null, uploading: false });
  const [vehicleFront, setVehicleFront] = useState<UploadState>({ uri: null, path: null, url: null, uploading: false });
  const [vehicleBack, setVehicleBack] = useState<UploadState>({ uri: null, path: null, url: null, uploading: false });
  const [vehicleLeft, setVehicleLeft] = useState<UploadState>({ uri: null, path: null, url: null, uploading: false });
  const [vehicleRight, setVehicleRight] = useState<UploadState>({ uri: null, path: null, url: null, uploading: false });

  const scrollRef = useRef<ScrollView>(null);
  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  const goNext = () => {
    if (step === "welcome") {
      setDirection("forward");
      setStep("nid");
    } else if (step === "nid") {
      if (!nidFront.uri || !nidBack.uri) {
        Alert.alert("Missing Documents", "Please upload both sides of your NID.");
        return;
      }
      setDirection("forward");
      setStep("license");
    } else if (step === "license") {
      if (!licenseFront.uri || !licenseBack.uri) {
        Alert.alert("Missing Documents", "Please upload both sides of your driving license.");
        return;
      }
      setDirection("forward");
      setStep("vehicle_reg");
    } else if (step === "vehicle_reg") {
      if (!vehicleReg.uri) {
        Alert.alert("Missing Document", "Please upload your vehicle registration.");
        return;
      }
      setDirection("forward");
      setStep("driver_photo");
    } else if (step === "driver_photo") {
      if (!driverPhoto.uri) {
        Alert.alert("Missing Photo", "Please take a clear photo of yourself.");
        return;
      }
      setDirection("forward");
      setStep("vehicle_photos");
    } else if (step === "vehicle_photos") {
      if (!vehicleFront.uri || !vehicleBack.uri || !vehicleLeft.uri || !vehicleRight.uri) {
        Alert.alert("Missing Photos", "Please upload all 4 sides of your vehicle.");
        return;
      }
      setDirection("forward");
      setStep("review");
    } else if (step === "review") {
      handleSubmit();
    }
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const goBack = () => {
    setDirection("back");
    if (step === "nid") setStep("welcome");
    else if (step === "license") setStep("nid");
    else if (step === "vehicle_reg") setStep("license");
    else if (step === "driver_photo") setStep("vehicle_reg");
    else if (step === "vehicle_photos") setStep("driver_photo");
    else if (step === "review") setStep("vehicle_photos");
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const pickImage = async (
    setState: React.Dispatch<React.SetStateAction<UploadState>>,
    docType: string,
    allowsEditing = false
  ) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      const file = result.assets[0];
      setState((prev) => ({ ...prev, uri: file.uri, uploading: true }));

      const response = await fetch(file.uri);
      const blob = await response.blob();
      const fileName = `${docType}/${Date.now()}_${file.fileName ?? "doc.jpg"}`;

      const { data, error } = await supabase.storage
        .from("driver-documents")
        .upload(fileName, blob, { upsert: true });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from("driver-documents")
        .getPublicUrl(data.path);

      setState({
        uri: file.uri,
        path: data.path,
        url: publicUrlData.publicUrl,
        uploading: false,
      });

      logger.info("[onboarding] uploaded", { docType, path: data.path });
    } catch (e: any) {
      logger.error("[onboarding] upload failed", { docType, error: e.message });
      setState((prev) => ({ ...prev, uploading: false }));
      Alert.alert("Upload Failed", "Could not upload image. Please try again.");
    }
  };

  const handleSubmit = async () => {
    setStep("submitting");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        Alert.alert("Error", "Not authenticated");
        setStep("review");
        return;
      }

      const payload = {
        nid_front_url: nidFront.url,
        nid_back_url: nidBack.url,
        license_front_url: licenseFront.url,
        license_back_url: licenseBack.url,
        vehicle_reg_url: vehicleReg.url,
        driver_photo_url: driverPhoto.url,
        vehicle_front_url: vehicleFront.url,
        vehicle_back_url: vehicleBack.url,
        vehicle_left_url: vehicleLeft.url,
        vehicle_right_url: vehicleRight.url,
      };

      const res = await fetch(`${API_URL}/api/driver/onboarding/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        Alert.alert("Submission Failed", err.error || "Please try again.");
        setStep("review");
        return;
      }

      setStep("pending");
    } catch (e) {
      logger.error("[onboarding] submit failed", e);
      Alert.alert("Error", "Network error. Please try again.");
      setStep("review");
    }
  };

  // ── Step Indicator ──
  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {STEPS.map((s, idx) => {
        const isActive = idx === currentStepIndex;
        const isCompleted = idx < currentStepIndex;
        return (
          <View key={s.key} style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                {
                  backgroundColor: isActive
                    ? colors.primary
                    : isCompleted
                      ? colors.primary
                      : isDark
                        ? colors.borderDark
                        : colors.borderLight,
                },
              ]}
            >
              {isCompleted && (
                <Ionicons name="checkmark" size={12} color={colors.white} />
              )}
              {!isCompleted && !isActive && (
                <Text style={[styles.stepNumber, { color: textSecondary }]}>
                  {idx + 1}
                </Text>
              )}
            </View>
            <Text
              style={[
                styles.stepLabel,
                {
                  color: isActive || isCompleted ? colors.primary : textSecondary,
                  fontFamily: isActive ? "Jakarta-Bold" : "Jakarta-Regular",
                },
              ]}
            >
              {s.label}
            </Text>
            {idx < STEPS.length - 1 && (
              <View
                style={[
                  styles.stepLine,
                  {
                    backgroundColor: isCompleted ? colors.primary : isDark ? colors.borderDark : colors.borderLight,
                  },
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );

  // ── Upload Box Component ──
  const UploadBox = ({
    label,
    sublabel,
    state,
    onPress,
    icon = "image",
  }: {
    label: string;
    sublabel: string;
    state: UploadState;
    onPress: () => void;
    icon?: any;
  }) => (
    <TouchableOpacity
      style={[
        styles.uploadBox,
        {
          backgroundColor: state.uri ? colors.primaryLight : surfaceBg,
          borderColor: state.uri ? colors.primary : borderColor,
          borderStyle: state.uri ? "solid" : "dashed",
        },
      ]}
      onPress={onPress}
      disabled={state.uploading}
    >
      {state.uploading ? (
        <ActivityIndicator color={colors.primary} />
      ) : state.uri ? (
        <View style={styles.uploadedPreview}>
          <Image source={{ uri: state.uri }} style={styles.previewImage} />
          <View style={styles.uploadedOverlay}>
            <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
          </View>
        </View>
      ) : (
        <>
          <View style={[styles.uploadIconBg, { backgroundColor: colors.primary + "15" }]}>
            <Ionicons name={icon} size={28} color={colors.primary} />
          </View>
          <Text style={[styles.uploadLabel, { color: textPrimary }]}>{label}</Text>
          <Text style={[styles.uploadSublabel, { color: textSecondary }]}>{sublabel}</Text>
        </>
      )}
    </TouchableOpacity>
  );

  // ── RENDER: WELCOME ──
  const renderWelcome = () => (
    <View style={styles.stepContent}>
      <View style={[styles.welcomeIcon, { backgroundColor: colors.primary + "15" }]}>
        <Ionicons name="shield-checkmark" size={48} color={colors.primary} />
      </View>
      <Text style={[styles.welcomeTitle, { color: textPrimary }]}>
        Complete Your Profile
      </Text>
      <Text style={[styles.welcomeText, { color: textSecondary }]}>
        To start earning with Ride, we need to verify your identity and vehicle. This usually takes 24-48 hours.
      </Text>
      <Text style={[styles.welcomeText, { color: textSecondary }]}>
        You'll need:
        {"\n"}• National ID (both sides)
        {"\n"}• Driving License (both sides)
        {"\n"}• Vehicle Registration
        {"\n"}• Your photo
        {"\n"}• Vehicle photos (4 angles)
      </Text>
      <CustomButton title="Start Verification" onPress={goNext} className="mt-8" />
    </View>
  );

  // ── RENDER: NID ──
  const renderNid = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: textPrimary }]}>National ID</Text>
      <Text style={[styles.stepDesc, { color: textSecondary }]}>
        Upload both sides of your NID. Make sure all text is clearly visible.
      </Text>
      <View style={styles.uploadRow}>
        <UploadBox
          label="Front Side"
          sublabel="Photo with NID front"
          state={nidFront}
          onPress={() => pickImage(setNidFront, "nid_front")}
        />
        <UploadBox
          label="Back Side"
          sublabel="Photo with NID back"
          state={nidBack}
          onPress={() => pickImage(setNidBack, "nid_back")}
        />
      </View>
    </View>
  );

  // ── RENDER: LICENSE ──
  const renderLicense = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: textPrimary }]}>Driving License</Text>
      <Text style={[styles.stepDesc, { color: textSecondary }]}>
        Upload both sides of your valid driving license.
      </Text>
      <View style={styles.uploadRow}>
        <UploadBox
          label="Front Side"
          sublabel="License front"
          state={licenseFront}
          onPress={() => pickImage(setLicenseFront, "license_front")}
        />
        <UploadBox
          label="Back Side"
          sublabel="License back"
          state={licenseBack}
          onPress={() => pickImage(setLicenseBack, "license_back")}
        />
      </View>
    </View>
  );

  // ── RENDER: VEHICLE REG ──
  const renderVehicleReg = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: textPrimary }]}>Vehicle Registration</Text>
      <Text style={[styles.stepDesc, { color: textSecondary }]}>
        Upload your vehicle registration certificate. All details must be readable.
      </Text>
      <UploadBox
        label="Registration Certificate"
        sublabel="Clear photo of full document"
        state={vehicleReg}
        onPress={() => pickImage(setVehicleReg, "vehicle_reg")}
        icon="document-text"
      />
    </View>
  );

  // ── RENDER: DRIVER PHOTO ──
  const renderDriverPhoto = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: textPrimary }]}>Your Photo</Text>
      <Text style={[styles.stepDesc, { color: textSecondary }]}>
        Take a clear photo of your face. No sunglasses, no hats. This is for rider safety.
      </Text>
      <UploadBox
        label="Selfie"
        sublabel="Clear face photo"
        state={driverPhoto}
        onPress={() => pickImage(setDriverPhoto, "driver_photo", true)}
        icon="person"
      />
    </View>
  );

  // ── RENDER: VEHICLE PHOTOS ──
  const renderVehiclePhotos = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: textPrimary }]}>Vehicle Photos</Text>
      <Text style={[styles.stepDesc, { color: textSecondary }]}>
        Upload 4 photos of your vehicle. Number plate must be clearly visible in the front photo.
      </Text>
      <View style={styles.vehicleGrid}>
        <UploadBox
          label="Front"
          sublabel="Number plate visible"
          state={vehicleFront}
          onPress={() => pickImage(setVehicleFront, "vehicle_front")}
          icon="car"
        />
        <UploadBox
          label="Back"
          sublabel="Rear view"
          state={vehicleBack}
          onPress={() => pickImage(setVehicleBack, "vehicle_back")}
          icon="car"
        />
        <UploadBox
          label="Left Side"
          sublabel="Left profile"
          state={vehicleLeft}
          onPress={() => pickImage(setVehicleLeft, "vehicle_left")}
          icon="car"
        />
        <UploadBox
          label="Right Side"
          sublabel="Right profile"
          state={vehicleRight}
          onPress={() => pickImage(setVehicleRight, "vehicle_right")}
          icon="car"
        />
      </View>
    </View>
  );

  // ── RENDER: REVIEW ──
  const renderReview = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: textPrimary }]}>Review Your Documents</Text>
      <Text style={[styles.stepDesc, { color: textSecondary }]}>
        Please review all uploaded documents before submitting.
      </Text>

      {[
        { label: "NID Front", state: nidFront },
        { label: "NID Back", state: nidBack },
        { label: "License Front", state: licenseFront },
        { label: "License Back", state: licenseBack },
        { label: "Vehicle Registration", state: vehicleReg },
        { label: "Your Photo", state: driverPhoto },
        { label: "Vehicle Front", state: vehicleFront },
        { label: "Vehicle Back", state: vehicleBack },
        { label: "Vehicle Left", state: vehicleLeft },
        { label: "Vehicle Right", state: vehicleRight },
      ].map((item) => (
        <View key={item.label} style={[styles.reviewRow, { borderBottomColor: borderColor }]}>
          <Ionicons
            name={item.state.uri ? "checkmark-circle" : "alert-circle"}
            size={20}
            color={item.state.uri ? colors.greenVariant : colors.danger}
          />
          <Text style={[styles.reviewLabel, { color: textPrimary }]}>{item.label}</Text>
          <Text
            style={[
              styles.reviewStatus,
              { color: item.state.uri ? colors.greenVariant : colors.danger },
            ]}
          >
            {item.state.uri ? "Uploaded" : "Missing"}
          </Text>
        </View>
      ))}

      <CustomButton
        title="Submit for Review"
        onPress={goNext}
        disabled={!nidFront.uri || !nidBack.uri || !licenseFront.uri || !licenseBack.uri || !vehicleReg.uri || !driverPhoto.uri || !vehicleFront.uri || !vehicleBack.uri || !vehicleLeft.uri || !vehicleRight.uri}
        className="mt-6"
      />
    </View>
  );

  // ── RENDER: SUBMITTING ──
  const renderSubmitting = () => (
    <View style={[styles.stepContent, styles.centerContent]}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.submittingText, { color: textPrimary }]}>
        Submitting your documents...
      </Text>
      <Text style={[styles.submittingSub, { color: textSecondary }]}>
        This may take a moment
      </Text>
    </View>
  );

  // ── RENDER: PENDING ──
  const renderPending = () => (
    <View style={[styles.stepContent, styles.centerContent]}>
      <View style={[styles.pendingIcon, { backgroundColor: colors.primary + "15" }]}>
        <Ionicons name="time" size={48} color={colors.primary} />
      </View>
      <Text style={[styles.pendingTitle, { color: textPrimary }]}>
        Under Review
      </Text>
      <Text style={[styles.pendingText, { color: textSecondary }]}>
        Your documents have been submitted. Our team will review them within 24-48 hours.
      </Text>
      <Text style={[styles.pendingText, { color: textSecondary }]}>
        You'll receive a notification once approved.
      </Text>
      <TouchableOpacity
        style={[styles.pendingBtn, { borderColor: borderColor }]}
        onPress={() => router.replace("/(main)/(rider)")}
      >
        <Text style={[styles.pendingBtnText, { color: textPrimary }]}>
          Go to Home
        </Text>
      </TouchableOpacity>
    </View>
  );

  // ── MAIN RENDER ──
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      {step !== "welcome" && step !== "pending" && (
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textPrimary }]}>
            {STEPS.find((s) => s.key === step)?.label || "Onboarding"}
          </Text>
          <View style={{ width: 44 }} />
        </View>
      )}

      {/* Step Indicator */}
      {step !== "welcome" && step !== "pending" && step !== "submitting" && renderStepIndicator()}

      {/* Content */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {step === "welcome" && renderWelcome()}
        {step === "nid" && renderNid()}
        {step === "license" && renderLicense()}
        {step === "vehicle_reg" && renderVehicleReg()}
        {step === "driver_photo" && renderDriverPhoto()}
        {step === "vehicle_photos" && renderVehiclePhotos()}
        {step === "review" && renderReview()}
        {step === "submitting" && renderSubmitting()}
        {step === "pending" && renderPending()}
      </ScrollView>

      {/* Bottom Action */}
      {step !== "welcome" && step !== "submitting" && step !== "pending" && (
        <View style={[styles.bottomBar, { backgroundColor: surfaceBg, borderTopColor: borderColor }]}>
          <CustomButton
            title={
              step === "review"
                ? "Submit for Review"
                : "Continue"
            }
            onPress={goNext}
            disabled={
              (step === "nid" && (!nidFront.uri || !nidBack.uri)) ||
              (step === "license" && (!licenseFront.uri || !licenseBack.uri)) ||
              (step === "vehicle_reg" && !vehicleReg.uri) ||
              (step === "driver_photo" && !driverPhoto.uri) ||
              (step === "vehicle_photos" && (!vehicleFront.uri || !vehicleBack.uri || !vehicleLeft.uri || !vehicleRight.uri))
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
  },
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  stepItem: {
    alignItems: "center",
    flex: 1,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  stepLabel: {
    fontSize: 10,
    marginTop: 4,
  },
  stepLine: {
    position: "absolute",
    top: 14,
    right: -50,
    width: 40,
    height: 2,
  },
  stepContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  welcomeIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 24,
  },
  welcomeTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 24,
    textAlign: "center",
    marginBottom: 12,
  },
  welcomeText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  stepTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 22,
    marginBottom: 8,
  },
  stepDesc: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  uploadRow: {
    flexDirection: "row",
    gap: 12,
  },
  uploadBox: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 160,
  },
  uploadIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  uploadLabel: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
    textAlign: "center",
  },
  uploadSublabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  uploadedPreview: {
    width: "100%",
    height: 120,
    borderRadius: 12,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  uploadedOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 14,
  },
  vehicleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  reviewLabel: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
    flex: 1,
  },
  reviewStatus: {
    fontFamily: "Jakarta-Bold",
    fontSize: 13,
  },
  submittingText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
    marginTop: 20,
  },
  submittingSub: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    marginTop: 8,
  },
  pendingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  pendingTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 24,
    marginBottom: 12,
    textAlign: "center",
  },
  pendingText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 20,
  },
  pendingBtn: {
    marginTop: 32,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 100,
    borderWidth: 1.5,
  },
  pendingBtnText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
});
