# KhozyReads — Design Brief (Cambodia Romantic Edition)

> **⚠️ IMPORTANT — TARGET LANGUAGES**
>
> **Default UI language: Khmer (ខ្មែរ)**
> **Secondary: English**
>
> **DO NOT use Indonesian, Malay, or any other language in the design.**
> The instructions in this brief are written in Indonesian only because that's how the project owner communicates — but the WEBSITE itself is for Cambodian readers.
>
> All text in the design must be in:
> - **Khmer** (primary, displayed by default)
> - **English** (secondary, shown when user toggles language)
>
> Sample Khmer text to use in mockups:
> - Home title: `ហាងសៀវភៅឌីជីថល` (Digital Book Store)
> - Buy button: `ទិញឥឡូវ` (Buy Now)
> - Read button: `អាន` (Read)
> - My Library: `បណ្ណាល័យរបស់ខ្ញុំ`
> - Login: `ចូល` / Register: `ចុះឈ្មោះ`
> - Pending: `កំពុងរង់ចាំ` / Approved: `យល់ព្រម` / Rejected: `បដិសេធ`

Send this file to claude.ai together with screenshots of your current pages to request a redesign.

---

## 🎨 Style Direction: Cambodia Romantic

### Mood & Vibe
- **Romantic, warm, dan elegant** — kayak baca novel di taman Angkor sore hari
- **Khmer cultural pride** — ornament tradisional jadi karakter utama
- **Easy to read** — typography besar dan jelas, ramah orang tua
- **Interesting** — interactive, ada movement halus, gak monoton
- **Premium feel** — kayak boutique digital library, bukan website biasa

### Color Palette

**Primary palette (Cambodia heritage):**
- **Deep Burgundy/Royal Red**: `#7B2D26` — primary action, accent
- **Saffron Gold**: `#D4A574` — highlight, ornament
- **Jade Green**: `#3D5B49` — secondary action, success
- **Ivory Cream**: `#FAF5E9` — background utama (lebih hangat dari putih)
- **Deep Indigo Night**: `#1E2A3A` — text utama, header
- **Soft Rose**: `#E8C5BC` — subtle accent, alert info

**Avoid:**
- Pure white (#FFF) — terlalu sterile
- Pure black (#000) — terlalu kontras
- Trendy neon colors

### Typography

- **Khmer**: `Noto Serif Khmer` atau `Noto Sans Khmer` (font stack)
- **English**: `Crimson Pro`, `Lora`, atau `Playfair Display` (serif elegan)
- **Base font size**: **17-18px** (lebih besar dari standar 14-15px, supaya enak baca lansia)
- **Line height**: 1.7 (banyak breathing room)
- **Headings**: serif font, gold/burgundy color, slight letter-spacing
- **Letter spacing**: 0.5px untuk body, lebih untuk heading

### Ornaments & Decorative Elements

Inspirasi visual khas Cambodia:

1. **Apsara silhouette** — penari surgawi, biasanya di corner sebagai dekoratif
2. **Lotus (ផ្កាឈូក)** — bunga teratai, simbol Cambodia, untuk loading animation
3. **Naga (នាគ)** — ular suci, bisa jadi divider antar section
4. **Khmer kbach (ក្បាច់)** — pattern ukiran tradisional, untuk border/frame
5. **Angkor stone texture** — subtle background untuk header
6. **Floral motif** — pola bunga khmer (jasmine, frangipani), bisa jadi corner ornament

### Decorative Implementation Ideas

- Border ornament di card buku (kbach pattern di pojok)
- Lotus divider antar section di home
- Apsara silhouette di header (subtle, opacity rendah)
- Filigree decoration di form login/register
- Naga curl di footer
- Floating lotus petals slow-falling di background home (CSS animation)

### Loading Animations

**Wajib ada di semua page transition + heavy operations:**

1. **Lotus bloom** (main loading): SVG lotus yang petalnya mekar perlahan (CSS animation)
2. **Khmer pattern flow**: pattern kbach bergerak horizontal/vertikal
3. **Apsara dance**: silhouette penari yang gerakannya halus
4. **Spinning sacred wheel**: chakra/dharma wheel berputar

Cukup pilih 1-2 yang konsisten. Pakai SVG inline supaya gampang di-style.

### Movement & Micro-interactions

- **Hover state**: tombol slight scale up + shadow + warna sedikit darker
- **Card hover**: lift effect (translate Y up 4px) + shadow soft
- **Page transition**: fade in (200ms ease) — bukan jump
- **Image load**: blur-up effect
- **Lotus petal**: slow falling animation di background (subtle, opacity 0.1)
- **Ornament breathing**: ornament corner sedikit "breathe" (scale 1→1.02→1, loop slow)
- **Watermark di PDF**: gerakan halus (drift), bukan teleport posisi

**Hindari:**
- Gerakan terlalu cepat / agresif
- Bounce effects yang norak
- Auto-play sound
- Flash colors

### GIF / Animation Sources

Saran asset yang bisa dipakai (royalty-free):

- **SVG ornaments**: cari "Khmer pattern SVG" atau "Cambodian filigree" di noun-project.com / svgrepo.com
- **Loading lotus**: bisa custom SVG + CSS animation (akan aku generate)
- **Background pattern**: bisa subtle CSS gradient + ornament overlay

---

## 👴 Ramah Orang Tua (Accessibility)

**Wajib ada:**

1. **Font besar default** — minimal 17px body, 22-24px untuk headings
2. **High contrast text** — text indigo/burgundy di background cream/ivory (ratio >= 7:1)
3. **Button gede** — minimal 48x48px, ada label jelas (bukan cuma icon)
4. **Spacing lega** — gap minimum 16px antar element, padding minimum 12px dalam button
5. **Hover indicator jelas** — kursor pointer + visual change
6. **Form label di atas input** — bukan placeholder yang ilang
7. **Error message jelas** — dengan icon + warna kontras + bahasa sederhana
8. **Navigasi konsisten** — tombol di posisi sama setiap page

---

## 📖 PDF Reader — Special Attention

Ini bagian yang paling penting karena user bakal lama di sini. Khusus design untuk **kenyamanan baca jangka panjang** dan **lansia friendly**.

### Layout Reader

```
┌─────────────────────────────────────────────────────────┐
│  [← Library]  Book Title (serif)        [🌙 dark mode]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                                                         │
│           ┌─────────────────────────┐                   │
│           │                         │                   │
│           │                         │                   │
│           │     PDF PAGE CONTENT    │                   │
│           │      (auto-fit width)   │                   │
│           │                         │                   │
│           │                         │                   │
│           │   ░ watermark drift ░   │                   │
│           │                         │                   │
│           └─────────────────────────┘                   │
│                                                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [◀ Prev]    Page 12 / 250 [slider==●==]   [Next ▶]    │
│              [-] 100% [+]   [Bookmark]   [Font A+ / A-] │
└─────────────────────────────────────────────────────────┘
```

### Reader Features (semuanya implementable)

1. **Page navigation:**
   - Big prev/next buttons (60x60px minimum) — gampang di-tap
   - **Page slider/scrubber** — drag untuk loncat ke page jauh
   - Page counter besar di tengah: "12 / 250"
   - **Keyboard support**: arrow keys ←→ untuk navigate
   - **Click area**: kiri canvas = prev, kanan canvas = next (subtle hint)
   - **Mobile**: swipe gesture untuk flip page

2. **Zoom controls:**
   - Pakai slider, bukan tombol kecil
   - Preset: 100% / 125% / 150% / Fit Width / Fit Page
   - Default: Fit Width

3. **Comfort features:**
   - **Dark mode toggle** (eye care untuk baca malam) — wajib
   - **Sepia mode** (kuning lembut, easier on eyes)
   - **Brightness slider** — kalau dark mode
   - **Auto-hide toolbar** setelah 3 detik (tap untuk show again)

4. **Progress indicator:**
   - Bar tipis di atas: indicate berapa persen udah dibaca
   - Auto-save reading position (resume next time)

5. **Bookmark:**
   - Toggle bookmark per page
   - List bookmark accessible

6. **Watermark (existing):**
   - Pertahankan watermark logic (username, ID, timestamp)
   - Style: opacity sangat rendah (5-10%), gerak halus
   - Pakai font serif elegan supaya gak ganggu reading

7. **Reader transitions:**
   - Page flip animation: subtle slide left/right (200ms)
   - Loading next page: ada spinner kecil di corner

### Reader Color Theme

- **Default (day)**: cream/ivory background, sepia tint, dark indigo text
- **Sepia (evening)**: deeper amber background, warm brown text
- **Night**: deep indigo black background, soft cream text (TIDAK pure black/white)

---

## 🔧 Technical Constraints (jangan dilanggar)

### 1. Single-file architecture
Semua HTML + CSS + JS dalam **1 file**.

### 2. Class names yang HARUS dipertahankan

```
#app, #auth-nav, #lang-switcher, #tg-bubble, #ss-warning
#reader-frame, #reader-toolbar, #reader-canvas-wrap, #reader-warning
#r-back, #r-prev, #r-next, #r-page, #r-zoomin, #r-zoomout
.watermark
[data-i18n="..."]
```

### 3. CSS variables wajib (untuk theming)

```css
:root {
  --bg: #FAF5E9;          /* cream */
  --bg-elevated: #FFFFFF;
  --fg: #1E2A3A;          /* indigo night */
  --fg-soft: #4A5568;
  --muted: #8B95A1;
  --border: #E5DCC5;      /* warm border */
  --primary: #7B2D26;     /* burgundy */
  --primary-fg: #FFFFFF;
  --accent: #D4A574;      /* saffron gold */
  --secondary: #3D5B49;   /* jade green */
  --danger: #C53030;
  --success: #38A169;
  --warning: #DD6B20;
  --soft-rose: #E8C5BC;

  --radius: 12px;
  --radius-lg: 20px;
  --gap: 16px;
  --maxw: 1100px;
  --shadow-sm: 0 2px 8px rgba(123, 45, 38, 0.08);
  --shadow-md: 0 8px 24px rgba(30, 42, 58, 0.1);

  --font-display: 'Crimson Pro', 'Noto Serif Khmer', serif;
  --font-body: 'Lora', 'Noto Sans Khmer', system-ui, serif;
  --font-base-size: 17px;
}

/* Dark mode for reader */
.reader-dark {
  --bg: #1E2A3A;
  --bg-elevated: #2A3849;
  --fg: #FAF5E9;
  --fg-soft: #B8C0C8;
}

/* Sepia mode for reader */
.reader-sepia {
  --bg: #E8D9B5;
  --bg-elevated: #F0E4C8;
  --fg: #4A3520;
}
```

### 4. Mobile responsive (min 360px)

---

## 📄 Halaman yang Perlu Di-design

### BUYER (`index.html`)

1. **Home / Store** — book grid + ornament corner + falling lotus petals background
2. **Book Detail** — 2 column layout, cover dengan frame ornament, info elegant
3. **Login** — form ditengah, dikelilingi ornament khmer
4. **Register** — sama, dengan validation friendly
5. **Payment Page** — QR code dengan ornamental frame, instruksi clear
6. **My Library** — book grid dengan reading progress indicator
7. **PDF Reader** — full feature (lihat section "PDF Reader Special Attention")
8. **Floating Telegram Bubble** — bisa dengan icon lotus + telegram blend
9. **Loading State** — lotus bloom animation
10. **Screenshot Warning** — full overlay dengan ornament khmer + warning text

### ADMIN (`admin.html`)

1. **Admin Login** — beda visual dari buyer, lebih formal/clean (admin gak perlu ornament heavy)
2. **Dashboard** — stat cards, recent orders table
3. **Books Management** — table dengan thumbnail, edit modal
4. **Orders** — table dengan tab filter
5. **Settings** — form sections, file upload untuk QR
6. **Activity Logs** — table dengan collapsible details

Admin pages: **simpler design**, fokus ke usability. Boleh sedikit ornament tapi gak heavy seperti buyer side.

---

## 🎬 Prompt Suggestion untuk Claude Design

Copy-paste prompt ini ke Claude.ai:

```
I need a complete redesign for my Khmer digital book store website called "KhozyReads".

⚠️ IMPORTANT:
- ALL UI text must be in KHMER (ខ្មែរ) by default, with ENGLISH as secondary toggle.
- DO NOT use Indonesian, Malay, or any other Southeast Asian language.
- Target market is Cambodia — not Indonesia, even though I'm typing in Indonesian.
- Sample Khmer text: "ហាងសៀវភៅឌីជីថល" (store title), "ទិញឥឡូវ" (buy now), "អាន" (read), "បណ្ណាល័យរបស់ខ្ញុំ" (my library).

Style direction: "Cambodia Romantic" — warm, elegant, with traditional Khmer ornaments (Apsara, lotus, kbach pattern, Naga, Angkor temple motifs). Think boutique digital library, not generic website.

Target audience: Cambodian readers, including elderly users — font must be readable (17px+), button sizes large (48px+), contrast high. Must render Khmer script properly (use 'Noto Serif Khmer' or 'Noto Sans Khmer' font).

Color palette:
- Burgundy #7B2D26 (primary)
- Saffron Gold #D4A574 (accent)
- Jade Green #3D5B49 (secondary)
- Ivory Cream #FAF5E9 (background)
- Indigo Night #1E2A3A (text)
- Soft Rose #E8C5BC (subtle accent)

Typography:
- Serif fonts (Crimson Pro / Lora for English)
- Noto Serif Khmer / Noto Sans Khmer for Khmer
- 17-18px base size
- 1.7 line height

Must include:
- Lotus bloom loading animation (SVG with CSS animation)
- Falling lotus petals background (subtle, looped CSS animation)
- Khmer kbach ornaments at card corners
- Apsara silhouette as header decoration
- Hover micro-interactions (scale, shadow, color)
- Mobile responsive (min 360px width)

Pages to design (one HTML file with hash routing):
1. Home (book grid)
2. Book detail (2 column)
3. Login & Register
4. Payment (with QR display)
5. My Library
6. PDF Reader — IMPORTANT: comfortable for long reading, with:
   - Big prev/next buttons (60x60px)
   - Page slider for jumping
   - Dark mode / sepia mode toggle
   - Brightness slider
   - Auto-hide toolbar after 3s
   - Reading progress bar
   - Keyboard arrow navigation
   - Floating animated watermark (very low opacity, drifting)

Technical:
- Pure HTML + CSS (vanilla, no React)
- Single file (all CSS inline in <style> tag)
- Use CSS variables for theming
- These class/ID names MUST remain unchanged because JS depends on them:
  #app, #auth-nav, #lang-switcher, #tg-bubble, #ss-warning,
  #reader-frame, #reader-toolbar, #reader-canvas-wrap, #reader-warning,
  #r-back, #r-prev, #r-next, #r-page, #r-zoomin, #r-zoomout,
  .watermark, [data-i18n]

Start with the Home page. Show me your design (HTML + CSS), then we'll iterate.
```

Kirim ini + screenshot current state → mulai per page atau full sekali.

---

## 🎨 Asset List (kalau perlu)

Yang mungkin perlu kamu siapin / download:

1. **Khmer pattern PNG/SVG** — buat ornament corner
   - Search: "khmer kbach SVG", "cambodian filigree pattern"
   - Source: svgrepo.com, freepik.com (free section)

2. **Apsara silhouette** — buat header decoration
   - Source: noun-project.com, openclipart.org

3. **Lotus icon** — buat loading + bullet point
   - Source: bisa SVG inline (akan aku bantu generate)

4. **Background texture** (optional) — stone temple texture sangat subtle
   - Search: "subtle paper texture", "vintage parchment"

5. **Floating Telegram icon** — pakai SVG yang udah ada di code

Kalau gak mau pusing nyari asset, kasih bilang ke Claude Design "use SVG inline, no external images" — dia bisa generate pattern sendiri.

---

## 📋 Checklist Final

Sebelum kasih hasil design ke aku buat integrate:

- [ ] Semua class name load-bearing masih ada
- [ ] CSS variables di `:root` (tidak hardcoded color)
- [ ] Font stack include Noto Serif Khmer
- [ ] Loading animation tersedia (lotus bloom atau similar)
- [ ] Hover state pada button & card
- [ ] Mobile responsive (test di 360px width)
- [ ] PDF reader punya: prev/next gede, slider, dark/sepia mode, watermark, keyboard nav
- [ ] Telegram bubble di pojok kanan bawah
- [ ] Screenshot warning overlay

Setelah Claude Design generate, **kasih hasilnya ke aku** sambil bilang halaman mana yang lagi di-design. Aku integrate sambil pastikan semua JavaScript logic tetap jalan.

Selamat designing! 🪷
