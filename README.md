# Rate My Meal

<div align="center">

![Rate My Meal Banner](https://img.shields.io/badge/Rate%20My%20Meal-AI%20Nutrition%20%26%20Roast-FF5722?style=for-the-badge&logo=fastapi&logoColor=white)

[![Expo](https://img.shields.io/badge/Expo-SDK%2057-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.86-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-1.5%20Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://aistudio.google.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)

**Snap your meal, calculate macros with Gemini AI vision, and get roasted by a brutal yet caring fitness trainer.**

[Key Features](#key-features) • [Tech Stack](#tech-stack) • [Quick Start](#quick-start) • [Database Setup](#supabase-database-setup) • [EAS Build](#build-standalone-apk-eas) • [Author](#author)

</div>

---

## Key Features

- **Multimodal AI Vision Analysis:** Capture directly with your camera or select from your gallery. Images are automatically optimized and analyzed using Google Gemini Vision.
- **Macro & Micronutrient Breakdown:** Accurately estimates:
  - Total Calories (kcal)
  - Protein (g)
  - Carbohydrates (g)
  - Fat (g)
  - Health Score (1 to 10)
- **Fitness Trainer Roast:** Get candid, humorous, and motivational feedback on your dietary choices delivered in the persona of an uncompromising fitness coach.
- **Real-time Cloud Sync (Supabase):** Automatically stores every scanned meal into PostgreSQL via Supabase with instant offline resilience.
- **Interactive Meal History:** Easily look back at previously logged meals, nutritional trends, scores, and past roasts.
- **Traffic Surge Fallback System:** Gracefully detects and handles API traffic spikes with automatic model switching or fallback simulation to guarantee a smooth user experience.
- **Modern Dark Mode & Micro-animations:** Styled with a clean dark aesthetic, custom vector icons, spring animations, and tabbed navigation.

---

## Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | [Expo SDK 57](https://expo.dev/) (React Native 0.86) | Cross-platform native mobile runtime |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | Type-safe development |
| **AI / Vision** | [@google/generative-ai](https://www.npmjs.com/package/@google/generative-ai) | Multimodal Gemini 1.5 Flash structured JSON response |
| **Database** | [Supabase](https://supabase.com/) (`@supabase/supabase-js`) | PostgreSQL backend with Row Level Security |
| **Build Tool** | [EAS Build](https://expo.dev/eas) | Cloud and local standalone `.apk` / `.aab` compilation |

---

## Quick Start

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm** or **yarn**
- **Expo Go** app installed on your physical mobile device (Android / iOS)

### 2. Clone the Repository
```bash
git clone https://github.com/chanatipjuntip303-cell/RateMyMeal.git
cd RateMyMeal
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Copy `.env.example` to create your local `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in your API credentials:
```env
# Google Gemini API Key (Get at https://aistudio.google.com)
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here

# Supabase Credentials (Get at https://supabase.com)
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 5. Start the Development Server
```bash
# Standard local development
npx expo start

# Or using Tunnel Mode (useful if device & PC are on different subnets)
npx expo start --tunnel
```
Scan the QR code with **Expo Go** (Android) or the **Camera app** (iOS).

---

## Supabase Database Setup

To enable meal logging and historical syncing, create a new project in [Supabase](https://supabase.com) and execute this SQL query in the **SQL Editor**:

```sql
-- 1. Create the meals table
CREATE TABLE public.meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_name TEXT NOT NULL,
  calories NUMERIC NOT NULL,
  protein NUMERIC NOT NULL,
  carbs NUMERIC NOT NULL,
  fat NUMERIC NOT NULL,
  health_score INTEGER NOT NULL,
  roast_comment TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

-- 3. Create policies for public client access
CREATE POLICY "Allow public read access"
  ON public.meals FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access"
  ON public.meals FOR INSERT
  WITH CHECK (true);
```

---

## Build Standalone APK (EAS)

This project is pre-configured with `eas.json` for direct Android `.apk` generation.

1. Install EAS CLI globally:
   ```bash
   npm install -g eas-cli
   ```
2. Log in to your Expo account:
   ```bash
   eas login
   ```
3. Run the APK build command:
   ```bash
   eas build -p android --profile preview
   ```
Once completed, EAS will provide a direct download link to install the `.apk` on any Android device.

---

## Project Structure

```text
RateMyMeal/
├── assets/                 # App icons, splash screens, and image assets
├── App.tsx                 # Core UI, Navigation, AI Pipeline, and State Logic
├── Icons.tsx               # Custom SVG Vector Icons system
├── supabase.ts             # Supabase client initialization & TypeScript models
├── app.json                # Expo configuration & app metadata
├── eas.json                # EAS Build profiles (APK generation configured)
├── package.json            # Scripts & project dependencies
├── tsconfig.json           # TypeScript configuration
├── .env.example            # Environment variables template
└── README.md               # Project documentation
```

---

## Author

Developed by **[@chanatipjuntip303-cell](https://github.com/chanatipjuntip303-cell)**
