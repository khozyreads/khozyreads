const dict = {
  kh: {
    home: "ទំព័រដើម",
    login: "ចូលគណនី",
    register: "បង្កើតគណនី",
    logout: "ចេញ",
    library: "បណ្ណាល័យខ្ញុំ",
    my_library: "បណ្ណាល័យខ្ញុំ",
    seller: "អ្នកលក់",
    seller_dashboard: "ផ្ទាំងអ្នកលក់",
    username: "ឈ្មោះអ្នកប្រើ",
    password: "ពាក្យសម្ងាត់",
    createAccount: "បង្កើតគណនី",
    create_account: "បង្កើតគណនី",
    signIn: "ចូលប្រើ",
    sign_in: "ចូលប្រើ",
    books: "សៀវភៅ និងរឿង",
    manageBooks: "គ្រប់គ្រងសៀវភៅ",
    add_book: "បន្ថែមសៀវភៅ",
    buy: "ទិញ",
    buy_now: "ទិញឥឡូវនេះ",
    login_to_buy: "ចូលគណនីដើម្បីទិញ",
    read: "អាន",
    read_book: "អានសៀវភៅ",
    price: "តម្លៃ",
    creator: "អ្នកនិពន្ធ",
    episodes: "ភាគ",
    add_episode: "បន្ថែមភាគ",
    synopsis: "សេចក្ដីសង្ខេប",
    totalEpisodes: "ចំនួនភាគសរុប",
    total_episodes: "ចំនួនភាគសរុប",
    unavailable: "មិនអាចទិញបានឥឡូវនេះ",
    disabledRemark: "សៀវភៅនេះមិនអាចទិញបានបណ្ដោះអាសន្ន។ អ្នកដែលបានទិញរួចនៅតែអាចអានភាគដែលបានទិញបាន។",
    joinTelegram: "ចូលក្រុម Telegram",
    join_telegram_group: "ចូលក្រុម Telegram",
    payment: "ការទូទាត់",
    uploadProof: "បង្ហោះបង្កាន់ដៃទូទាត់",
    upload_payment_proof: "បង្ហោះបង្កាន់ដៃទូទាត់",
    submitProof: "ដាក់ស្នើបង្កាន់ដៃ",
    submit_proof: "ដាក់ស្នើបង្កាន់ដៃ",
    pending: "កំពុងរង់ចាំពិនិត្យ",
    pending_verification: "កំពុងរង់ចាំពិនិត្យ",
    approved: "បានអនុម័ត",
    rejected: "បានបដិសេធ",
    rejectedHelp: "ការទូទាត់ត្រូវបានបដិសេធ។ សូមទាក់ទងអ្នកលក់។",
    noAccess: "អ្នកមិនទាន់មានសិទ្ធិអានសៀវភៅនេះទេ។",
    purchase_required: "អ្នកត្រូវទិញសៀវភៅនេះ មុនពេលអាន។",
    book_not_found: "រកមិនឃើញសៀវភៅនេះទេ។",
    missing_book_id: "មិនមានលេខសម្គាល់សៀវភៅនៅក្នុង URL ទេ។ សូមបើកសៀវភៅពីទំព័រដើម ឬផ្ទាំងគ្រប់គ្រង។",
    view: "មើល",
    not_logged_in: "សូមចូលគណនីជាមុនសិន។",
    upload_again: "បង្ហោះម្ដងទៀត",
    episode_saved: "បានរក្សាទុកភាគរួច។",
    book_saved: "បានរក្សាទុកសៀវភៅរួច។ សូមចុច View ក្នុងតារាងខាងក្រោម ដើម្បីបើកសៀវភៅ។",
    episode_saved_source_warning: "បានរក្សាទុកភាគរួច ប៉ុន្តែឯកសារប្រភពមិនអាចបង្ហោះបានទេ។ សូមពិនិត្យ bucket story-files ឬសាកល្បងម្ដងទៀត។",
    unsupported_source_file: "អាចបង្ហោះបានតែឯកសារ PDF, DOC ឬ DOCX ប៉ុណ្ណោះ។",
    source_file_upload_failed: "មិនអាចបង្ហោះឯកសារប្រភពបានទេ។ ភាគត្រូវបានរក្សាទុកដោយគ្មានឯកសារ។",
    protectedNotice: "មាតិកានេះត្រូវបានការពារ។ មិនអនុញ្ញាតឱ្យថតអេក្រង់ ថតវីដេអូ ចម្លង ឬចែកចាយឡើយ។",
    paymentNotice: "ការផ្ទៀងផ្ទាត់ការទូទាត់ធ្វើដោយដៃតែក្នុងម៉ោងធ្វើការប៉ុណ្ណោះ។ ការទូទាត់ក្រៅម៉ោងធ្វើការអាចយឺត។ សូមបង្ហោះបង្កាន់ដៃច្បាស់បន្ទាប់ពីទូទាត់រួច។",
    payment_notice: "ការផ្ទៀងផ្ទាត់ការទូទាត់ធ្វើដោយដៃតែក្នុងម៉ោងធ្វើការប៉ុណ្ណោះ។ ការទូទាត់ក្រៅម៉ោងធ្វើការអាចយឺត។ សូមបង្ហោះបង្កាន់ដៃច្បាស់បន្ទាប់ពីទូទាត់រួច។",
    dashboard: "ផ្ទាំងគ្រប់គ្រង",
    manageOrders: "គ្រប់គ្រងការបញ្ជាទិញ",
    orders: "ការបញ្ជាទិញ",
    settings: "ការកំណត់",
    save: "រក្សាទុក",
    cancel: "បោះបង់",
    delete: "លុប",
    edit: "កែប្រែ",
    add: "បន្ថែម",
    approve: "អនុម័ត",
    reject: "បដិសេធ",
    status: "ស្ថានភាព",
    proof: "បង្កាន់ដៃ",
    workingHours: "ម៉ោងធ្វើការ",
    working_hours: "ម៉ោងធ្វើការ",
    loading: "កំពុងផ្ទុក...",
    empty: "មិនទាន់មានទិន្នន័យទេ។",
    error: "មានបញ្ហា។ សូមព្យាយាមម្ដងទៀត។",
    registered_success: "បានបង្កើតគណនីរួច។ សូមចូលគណនីដើម្បីបន្ត។",
    buyer_login_help: "ចូលដោយប្រើឈ្មោះអ្នកប្រើ និងពាក្យសម្ងាត់របស់អ្នក។",
    register_help: "បង្កើតគណនីដោយប្រើឈ្មោះអ្នកប្រើទម្រង់ឈ្មោះបូកលេខ។ ឧទាហរណ៍ dara123។",
    seller_login_help: "សម្រាប់អ្នកលក់ ឬអ្នកគ្រប់គ្រងតែប៉ុណ្ណោះ។",
    payment_helper: "សូមបង់ប្រាក់តាម ABA QR / KHQR ហើយបង្ហោះបង្កាន់ដៃច្បាស់។",
    book_management_help: "បន្ថែម កែប្រែ ឬបិទការទិញសៀវភៅ។",
    episode_management: "គ្រប់គ្រងភាគ",
    episode_management_help: "បន្ថែម ឬកែប្រែភាគសម្រាប់សៀវភៅនីមួយៗ។",
    settings_help: "កែប្រែព័ត៌មានគេហទំព័រ ការទូទាត់ ម៉ោងធ្វើការ និង Telegram។",
    orders_help: "ពិនិត្យបង្កាន់ដៃ ហើយអនុម័ត ឬបដិសេធការទូទាត់។",
    title: "ចំណងជើង",
    cover_image: "រូបគម្រប",
    upload_logo: "បង្ហោះឡូហ្គោ",
    upload_aba_qr: "បង្ហោះ ABA QR",
    optional_source_file: "ឯកសារប្រភព PDF/Word ស្រេចចិត្ត",
    available_from: "អាចទិញចាប់ពី",
    available_until: "អាចទិញដល់",
    buy_enabled: "បើកប៊ូតុងទិញ",
    telegram_group_url: "តំណក្រុម Telegram",
    telegram_button_text: "អត្ថបទប៊ូតុង Telegram",
    disabled_remark: "សម្គាល់ពេលបិទការទិញ",
    currency: "រូបិយប័ណ្ណ",
    language: "ភាសា",
    website_name: "ឈ្មោះគេហទំព័រ",
    website_logo_url: "តំណឡូហ្គោគេហទំព័រ",
    default_language: "ភាសាលំនាំដើម",
    aba_qr_image_url: "តំណរូប ABA QR",
    aba_account_name: "ឈ្មោះគណនី ABA",
    aba_account_number: "លេខគណនី ABA",
    default_currency: "រូបិយប័ណ្ណលំនាំដើម",
    default_telegram_group_url: "តំណ Telegram លំនាំដើម",
    default_telegram_button_text: "អត្ថបទប៊ូតុង Telegram លំនាំដើម",
    facebook_page_url: "តំណទំព័រ Facebook",
    payment_notice_kh: "សារជូនដំណឹងការទូទាត់ជាភាសាខ្មែរ",
    payment_notice_en: "សារជូនដំណឹងការទូទាត់ជាភាសាអង់គ្លេស"
  },
  en: {
    home: "Home",
    login: "Login",
    register: "Register",
    logout: "Logout",
    library: "My Library",
    my_library: "My Library",
    seller: "Seller",
    seller_dashboard: "Seller Dashboard",
    username: "Username",
    password: "Password",
    createAccount: "Create Account",
    create_account: "Create Account",
    signIn: "Sign In",
    sign_in: "Sign In",
    books: "Books and Stories",
    manageBooks: "Book Management",
    add_book: "Add Book",
    buy: "Buy",
    buy_now: "Buy Now",
    login_to_buy: "Login to Buy",
    read: "Read",
    read_book: "Read Book",
    price: "Price",
    creator: "Creator",
    episodes: "Episodes",
    add_episode: "Add Episode",
    synopsis: "Synopsis",
    totalEpisodes: "Total episodes",
    total_episodes: "Total episodes",
    unavailable: "Unavailable for purchase",
    disabledRemark: "This book is temporarily unavailable for purchase. Existing buyers can still access their purchased episodes.",
    joinTelegram: "Join Telegram Group",
    join_telegram_group: "Join Telegram Group",
    payment: "Payment",
    uploadProof: "Upload payment proof",
    upload_payment_proof: "Upload payment proof",
    submitProof: "Submit proof",
    submit_proof: "Submit proof",
    pending: "Pending Verification",
    pending_verification: "Pending Verification",
    approved: "Approved",
    rejected: "Rejected",
    rejectedHelp: "Payment rejected. Please contact seller.",
    noAccess: "You do not have access to read this book yet.",
    purchase_required: "You need to purchase this book before reading.",
    book_not_found: "Book not found.",
    missing_book_id: "No book ID was found in the URL. Please open the book from the home page or dashboard.",
    view: "View",
    not_logged_in: "Please log in first.",
    upload_again: "Upload Again",
    episode_saved: "Episode saved.",
    book_saved: "Book saved. Click View in the table below to open it.",
    episode_saved_source_warning: "Episode saved, but the source file could not be uploaded. Please check the story-files bucket or try again.",
    unsupported_source_file: "Only PDF, DOC, or DOCX files are supported.",
    source_file_upload_failed: "Source file upload failed. The episode was saved without the file.",
    protectedNotice: "This content is protected. Screenshot, screen recording, copying, or redistribution is not allowed.",
    paymentNotice: "Payment verification is handled manually during working hours only. Payments made outside working hours may experience delay. Please upload a clear payment receipt after completing your payment.",
    payment_notice: "Payment verification is handled manually during working hours only. Payments made outside working hours may experience delay. Please upload a clear payment receipt after completing your payment.",
    dashboard: "Dashboard",
    manageOrders: "Order Management",
    orders: "Orders",
    settings: "Site Settings",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    add: "Add",
    approve: "Approve",
    reject: "Reject",
    status: "Status",
    proof: "Proof",
    workingHours: "Working Hours",
    working_hours: "Working Hours",
    loading: "Loading...",
    empty: "No data yet.",
    error: "Something went wrong. Please try again.",
    registered_success: "Account created. Please log in to continue.",
    buyer_login_help: "Sign in with your username and password.",
    register_help: "Create an account with a username using name plus number, for example dara123.",
    seller_login_help: "For sellers and admins only.",
    payment_helper: "Pay with ABA QR / KHQR, then upload a clear payment receipt.",
    book_management_help: "Add, edit, archive, or control purchase availability for books.",
    episode_management: "Episode Management",
    episode_management_help: "Add or edit episodes for each book.",
    settings_help: "Update website, payment, working hours, and Telegram settings.",
    orders_help: "Review receipts and approve or reject payments.",
    title: "Title",
    cover_image: "Cover image",
    upload_logo: "Upload logo",
    upload_aba_qr: "Upload ABA QR",
    optional_source_file: "Optional PDF/Word source file",
    available_from: "Available from",
    available_until: "Available until",
    buy_enabled: "Buy enabled",
    telegram_group_url: "Telegram group URL",
    telegram_button_text: "Telegram button text",
    disabled_remark: "Disabled remark",
    currency: "Currency",
    language: "Language",
    website_name: "Website name",
    website_logo_url: "Website logo URL",
    default_language: "Default language",
    aba_qr_image_url: "ABA QR image URL",
    aba_account_name: "ABA account name",
    aba_account_number: "ABA account number",
    default_currency: "Default currency",
    default_telegram_group_url: "Default Telegram group URL",
    default_telegram_button_text: "Default Telegram button text",
    facebook_page_url: "Facebook Page URL",
    payment_notice_kh: "Payment notice KH",
    payment_notice_en: "Payment notice EN"
  }
};

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function originalValue(el, attr) {
  const storeAttr = `data-i18n-original-${attr.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
  if (!el.hasAttribute(storeAttr)) {
    const value = attr === "text" ? el.textContent : el.getAttribute(attr);
    el.setAttribute(storeAttr, clean(value));
  }
  return clean(el.getAttribute(storeAttr));
}

export function getLang() {
  return localStorage.getItem("khozyreads.lang") || "kh";
}

export function translate(key, fallback = "") {
  const lang = getLang();
  const translated = clean(dict[lang]?.[key]);
  if (translated) return translated;

  const english = clean(dict.en?.[key]);
  if (english) return english;

  const original = clean(fallback);
  if (original) return original;

  return key;
}

export function t(key, fallback = "") {
  return translate(key, fallback);
}

export function translateElement(el) {
  if (el.dataset.i18n) {
    const fallback = originalValue(el, "text");
    const value = translate(el.dataset.i18n, fallback);
    if (value) el.textContent = value;
  }

  if (el.dataset.i18nPlaceholder) {
    const fallback = originalValue(el, "placeholder");
    const value = translate(el.dataset.i18nPlaceholder, fallback);
    if (value) el.setAttribute("placeholder", value);
  }

  if (el.dataset.i18nTitle) {
    const fallback = originalValue(el, "title");
    const value = translate(el.dataset.i18nTitle, fallback);
    if (value) el.setAttribute("title", value);
  }

  if (el.dataset.i18nAria) {
    const fallback = originalValue(el, "aria-label");
    const value = translate(el.dataset.i18nAria, fallback);
    if (value) el.setAttribute("aria-label", value);
  }

  if (el.dataset.i18nValue && ["INPUT", "BUTTON"].includes(el.tagName)) {
    const fallback = originalValue(el, "value");
    const value = translate(el.dataset.i18nValue, fallback);
    if (value) el.value = value;
  }
}

export function setLang(lang) {
  localStorage.setItem("khozyreads.lang", lang === "en" ? "en" : "kh");
  applyI18n();
}

export function applyI18n(root = document) {
  document.documentElement.lang = getLang();
  root
    .querySelectorAll("[data-i18n], [data-i18n-placeholder], [data-i18n-title], [data-i18n-aria], [data-i18n-value]")
    .forEach(translateElement);
  document.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === getLang());
  });
}

window.KR_I18N = { t, translate, getLang, setLang, applyI18n, translateElement };
