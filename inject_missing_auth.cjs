const fs = require('fs');

const data = {
  fr: {
    otpSendError: "Erreur lors de l'envoi du code OTP.",
    otpSentSuccess: "Un code à 6 chiffres a été envoyé par SMS.",
    passwordLengthError: "Le mot de passe doit faire au moins 6 caractères.",
    resetError: "Erreur lors de la réinitialisation.",
    resetSuccess: "Mot de passe modifié avec succès ! Vous pouvez vous connecter.",
    forgotPassword: "Mot de passe oublié",
    forgotPasswordDesc1: "Entrez votre numéro de téléphone pour recevoir un code de réinitialisation par SMS.",
    forgotPasswordDesc2: "Entrez le code reçu par SMS et choisissez votre nouveau mot de passe.",
    phonePlaceholder: "Numéro de téléphone",
    sending: "Envoi en cours...",
    sendOtpBtn: "Envoyer le code par SMS",
    backToLogin: "Retour à la connexion",
    otpPlaceholder: "Code à 6 chiffres",
    newPasswordPlaceholder: "Nouveau mot de passe",
    verifying: "Vérification...",
    validateNewPassword: "Valider le nouveau mot de passe",
    didNotReceiveCode: "Je n'ai pas reçu le code",

    parentRegister: "Inscription Parent",
    schoolCode: "Code de l'école (School Slug)",
    schoolCodeEx: "ex: mon_ecole_2025",
    askCodeAdmin: "Demandez ce code à l'administration de votre école.",
    fullNameParent: "Nom Complet (Parent)",
    fullNameEx: "ex: Koffi Kouassi",
    phone: "Numéro de téléphone",
    phoneUsedForLogin: "Ce numéro sera utilisé pour la connexion",
    phoneMustMatch: "Le numéro doit correspondre à celui enregistré par l'école pour vos enfants.",
    password: "Mot de passe",
    min6Chars: "Minimum 6 caractères",
    acceptTermsAndCertify: "J'accepte les conditions d'utilisation et certifie que ce numéro m'appartient bien.",
    createParentAccount: "Créer mon compte Parent"
  },
  en: {
    otpSendError: "Error sending OTP code.",
    otpSentSuccess: "A 6-digit code has been sent via SMS.",
    passwordLengthError: "Password must be at least 6 characters.",
    resetError: "Error during reset.",
    resetSuccess: "Password successfully changed! You can now log in.",
    forgotPassword: "Forgot Password",
    forgotPasswordDesc1: "Enter your phone number to receive a reset code via SMS.",
    forgotPasswordDesc2: "Enter the code received via SMS and choose your new password.",
    phonePlaceholder: "Phone number",
    sending: "Sending...",
    sendOtpBtn: "Send SMS code",
    backToLogin: "Back to login",
    otpPlaceholder: "6-digit code",
    newPasswordPlaceholder: "New password",
    verifying: "Verifying...",
    validateNewPassword: "Validate new password",
    didNotReceiveCode: "I didn't receive the code",

    parentRegister: "Parent Registration",
    schoolCode: "School Code (School Slug)",
    schoolCodeEx: "ex: my_school_2025",
    askCodeAdmin: "Ask your school administration for this code.",
    fullNameParent: "Full Name (Parent)",
    fullNameEx: "ex: John Doe",
    phone: "Phone Number",
    phoneUsedForLogin: "This number will be used for login",
    phoneMustMatch: "The number must match the one registered by the school for your children.",
    password: "Password",
    min6Chars: "Minimum 6 characters",
    acceptTermsAndCertify: "I accept the terms of use and certify that this number belongs to me.",
    createParentAccount: "Create my Parent account"
  },
  es: {
    otpSendError: "Error al enviar el código OTP.",
    otpSentSuccess: "Se ha enviado un código de 6 dígitos por SMS.",
    passwordLengthError: "La contraseña debe tener al menos 6 caracteres.",
    resetError: "Error durante el restablecimiento.",
    resetSuccess: "¡Contraseña cambiada con éxito! Ahora puede iniciar sesión.",
    forgotPassword: "Contraseña olvidada",
    forgotPasswordDesc1: "Ingrese su número de teléfono para recibir un código de restablecimiento por SMS.",
    forgotPasswordDesc2: "Ingrese el código recibido por SMS y elija su nueva contraseña.",
    phonePlaceholder: "Número de teléfono",
    sending: "Enviando...",
    sendOtpBtn: "Enviar código por SMS",
    backToLogin: "Volver al inicio de sesión",
    otpPlaceholder: "Código de 6 dígitos",
    newPasswordPlaceholder: "Nueva contraseña",
    verifying: "Verificando...",
    validateNewPassword: "Validar nueva contraseña",
    didNotReceiveCode: "No recibí el código",

    parentRegister: "Registro de Padre",
    schoolCode: "Código de la Escuela (School Slug)",
    schoolCodeEx: "ej: mi_escuela_2025",
    askCodeAdmin: "Pida este código a la administración de su escuela.",
    fullNameParent: "Nombre Completo (Padre)",
    fullNameEx: "ej: Juan Pérez",
    phone: "Número de teléfono",
    phoneUsedForLogin: "Este número se usará para iniciar sesión",
    phoneMustMatch: "El número debe coincidir con el registrado por la escuela para sus hijos.",
    password: "Contraseña",
    min6Chars: "Mínimo 6 caracteres",
    acceptTermsAndCertify: "Acepto los términos de uso y certifico que este número me pertenece.",
    createParentAccount: "Crear mi cuenta de Padre"
  },
  ar: {
    otpSendError: "خطأ أثناء إرسال رمز التحقق.",
    otpSentSuccess: "تم إرسال رمز مكون من 6 أرقام عبر رسالة قصيرة.",
    passwordLengthError: "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.",
    resetError: "خطأ أثناء إعادة التعيين.",
    resetSuccess: "تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول.",
    forgotPassword: "نسيت كلمة المرور",
    forgotPasswordDesc1: "أدخل رقم هاتفك لتلقي رمز إعادة التعيين عبر رسالة قصيرة.",
    forgotPasswordDesc2: "أدخل الرمز المستلم عبر الرسالة القصيرة واختر كلمة مرورك الجديدة.",
    phonePlaceholder: "رقم الهاتف",
    sending: "جارٍ الإرسال...",
    sendOtpBtn: "إرسال الرمز عبر رسالة قصيرة",
    backToLogin: "العودة لتسجيل الدخول",
    otpPlaceholder: "رمز من 6 أرقام",
    newPasswordPlaceholder: "كلمة مرور جديدة",
    verifying: "جارٍ التحقق...",
    validateNewPassword: "تأكيد كلمة المرور الجديدة",
    didNotReceiveCode: "لم أستلم الرمز",

    parentRegister: "تسجيل ولي الأمر",
    schoolCode: "رمز المدرسة",
    schoolCodeEx: "مثال: my_school_2025",
    askCodeAdmin: "اطلب هذا الرمز من إدارة مدرستك.",
    fullNameParent: "الاسم الكامل (ولي الأمر)",
    fullNameEx: "مثال: محمد عبدالله",
    phone: "رقم الهاتف",
    phoneUsedForLogin: "سيتم استخدام هذا الرقم لتسجيل الدخول",
    phoneMustMatch: "يجب أن يتطابق الرقم مع الرقم المسجل لدى المدرسة لأطفالك.",
    password: "كلمة المرور",
    min6Chars: "6 أحرف كحد أدنى",
    acceptTermsAndCertify: "أوافق على شروط الاستخدام وأقر بأن هذا الرقم يخصني.",
    createParentAccount: "إنشاء حساب ولي الأمر الخاص بي"
  }
};

for (const lang of ['fr', 'en', 'es', 'ar']) {
  const f = `src/i18n/${lang}.ts`;
  let c = fs.readFileSync(f, 'utf8');

  let replacement = '';
  for (const [key, val] of Object.entries(data[lang])) {
    // Only inject if it doesn't already exist
    if (!c.includes(`${key}:`)) {
      replacement += `    ${key}: '${val.replace(/'/g, "\\'")}',\n`;
    }
  }

  if (replacement) {
    c = c.replace(/auth: \{/, `auth: {\n${replacement}`);
    fs.writeFileSync(f, c, 'utf8');
  }
}

console.log("Injected missing auth keys for all languages.");
