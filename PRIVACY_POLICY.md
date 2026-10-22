# Privacy Policy for Rate My Meal (นโยบายความเป็นส่วนตัว)

**Last Updated:** October 22, 2026  
**Application Name:** Rate My Meal  
**Package Name:** cam.ratemymeal.app  

---

## ภาษาไทย (Thai Version)

### 1. บทนำ
แอปพลิเคชัน **Rate My Meal** ("เรา", "แอปพลิเคชัน") ให้ความสำคัญสูงสุดกับความเป็นส่วนตัวของผู้ใช้งาน นโยบายความเป็นส่วนตัวนี้จัดทำขึ้นเพื่อชี้แจงเกี่ยวกับการเข้าถึง การใช้งาน และการเก็บรักษาข้อมูลเมื่อท่านใช้งานแอปพลิเคชันของเรา

### 2. ข้อมูลและการขอสิทธิ์การเข้าถึง (Permissions)
แอปพลิเคชันมีการขอสิทธิ์การเข้าถึงอุปกรณ์เท่าที่จำเป็นต่อการทำงานหลักเท่านั้น:
- **กล้องถ่ายรูป (android.permission.CAMERA):** ใช้เฉพาะเมื่อผู้ใช้ต้องการถ่ายภาพอาหารจานปัจจุบันเพื่อส่งไปให้ AI ประเมินสารอาหารและวิเคราะห์พลังงาน
- **คลังภาพและสื่อ (Photo Gallery / Storage):** ใช้เฉพาะเมื่อผู้ใช้เลือกอัปโหลดรูปภาพอาหารที่มีอยู่แล้วในเครื่องเพื่อทำการวิเคราะห์

> **หมายเหตุ:** แอปพลิเคชันไม่มีการแอบบันทึกภาพพื้นหลัง ไม่มีการเข้าถึงไมโครโฟน และไม่มีการเข้าถึงข้อมูลระบุตำแหน่ง (GPS) ใดๆ ทั้งสิ้น

### 3. การประมวลผลด้วยปัญญาประดิษฐ์ (AI Processing)
- เมื่อท่านกดยืนยันการวิเคราะห์อาหาร รูปภาพอาหารจะถูกแปลงเป็นข้อมูลดิจิทัลและส่งต่อไปยัง API ปัญญาประดิษฐ์ (เช่น Google Gemini API หรือ Groq API) ตามการตั้งค่า เพื่อระบุชื่ออาหาร คำนวณปริมาณแคลอรี่ และสารอาหารหลัก (โปรตีน, คาร์โบไฮเดรต, ไขมัน)
- เราไม่มีการนำภาพอาหารของท่านไปใช้ในการฝึกฝนโมเดลเพื่อการค้าของบุคคลที่สาม หรือส่งต่อเพื่อจุดประสงค์ทางการโฆษณา

### 4. สถาปัตยกรรมการเก็บข้อมูลแบบ Local-First & Personal Cloud
- **การเก็บข้อมูลในเครื่อง (Local Storage):** ประวัติมื้ออาหาร ผลการประเมินแคลอรี่ และ API Key ของท่าน จะถูกเข้ารหัสและบันทึกไว้ในหน่วยความจำของอุปกรณ์ท่านเองผ่าน `AsyncStorage`
- **การสำรองข้อมูลบนคลาวด์ส่วนตัว (Bring Your Own Supabase):** หากท่านเลือกเปิดใช้งานระบบ Cloud Backup ข้อมูลมื้ออาหารจะถูกส่งตรงไปยังฐานข้อมูล Supabase **ส่วนตัวของท่านเองเท่านั้น** ทีมพัฒนาไม่มีฐานข้อมูลส่วนกลางในการดักจับหรือเก็บรวบรวมข้อมูลของผู้ใช้

### 5. การเปิดเผยข้อมูลแก่บุคคลภายนอก (Third-Party Sharing)
เราไม่มีนโยบายขาย แลกเปลี่ยน หรือเปิดเผยข้อมูลส่วนบุคคลใดๆ แก่บุคคลภายนอก ยกเว้นบริการโครงสร้างพื้นฐานที่จำเป็นต่อการประมวลผลคำขอของผู้ใช้ (เช่น Google AI Studio API เมื่อท่านเรียกใช้งาน AI)

### 6. การลบข้อมูล (Data Retention & Deletion)
ท่านสามารถลบประวัติมื้ออาหารทั้งหมดได้ทุกเมื่อผ่านปุ่ม **"ล้างประวัติ"** ภายในแอป หรือลบแอปพลิเคชันออกจากเครื่อง ข้อมูลทั้งหมดในเครื่องจะถูกลบทันที

### 7. นโยบายความเป็นส่วนตัวของเด็ก (Children's Privacy)
แอปพลิเคชันนี้ไม่ได้มุ่งเป้าไปยังเด็กที่มีอายุต่ำกว่า 13 ปี และเราไม่มีเจตนาเก็บรวบรวมข้อมูลส่วนบุคคลที่สามารถระบุตัวตนของเด็ก หากท่านเป็นผู้ปกครองและพบว่าบุตรหลานของท่านได้ให้ข้อมูลแก่เรา โปรดติดต่อเราเพื่อดำเนินการลบข้อมูลดังกล่าวโดยทันที

### 8. ความปลอดภัยของข้อมูล (Data Security)
เราใช้มาตรการรักษาความปลอดภัยระดับมาตรฐานสากล การส่งผ่านข้อมูลทั้งหมด (รวมถึงรูปภาพอาหารและข้อมูลสารอาหาร) ระหว่างแอปพลิเคชันไปยังเซิร์ฟเวอร์ AI และคลาวด์ จะกระทำผ่านการเชื่อมต่อที่เข้ารหัสปลอดภัยขั้นสูง (HTTPS/TLS) เสมอ

### 9. ข้อมูลติดต่อ
หากท่านมีข้อสงสัยหรือข้อเสนอแนะเกี่ยวกับนโยบายความเป็นส่วนตัวนี้ สามารถติดต่อเราได้ที่:
- **Email:** ratemymeal.app@gmail.com
- **Website/GitHub:** https://github.com/chanatipjuntip303-cell/RateMyMeal

---

## English Version

### 1. Introduction
**Rate My Meal** ("we", "our", or "app") is committed to protecting your privacy. This Privacy Policy explains how our mobile application handles your information when you use our services.

### 2. Device Permissions We Request
Our application only requests necessary permissions to deliver its core meal analysis functionality:
- **Camera (`android.permission.CAMERA`):** Used strictly to capture real-time meal photos for AI nutritional analysis.
- **Photos / Media Library:** Used strictly when you choose to upload an existing food image from your device gallery.

> We do **not** record background photos, do not access audio/microphone, and do not track your location.

### 3. AI Service Providers
When analyzing meals, image data is transmitted directly to AI APIs (Google Gemini API / Groq API) via encrypted HTTPS to calculate estimated calories, macros, and nutrition advice. We do not use your private meal photos for targeted advertising, third-party profiling, or commercial model training.

### 4. Local-First & Personal Cloud Storage
- **On-Device Storage:** Meal history and your custom API keys are saved locally on your device via AsyncStorage.
- **Personal Cloud Backup:** If configured, meal logs sync directly to your own personal Supabase project. We do not run a centralized database that captures user meal records.

### 5. Data Retention & Deletion
You can delete all stored meals directly in the app via the **"Clear History"** button at any time or by uninstalling the application.

### 6. Children's Privacy
Our services are not directed to individuals under the age of 13. We do not knowingly collect personally identifiable information from children under 13.

### 7. Data Security
We implement strict industry-standard security safeguards. All communications between the app and external AI / cloud endpoints are encrypted in transit using Transport Layer Security (TLS/HTTPS).

### 8. Contact Us
For any inquiries regarding this policy, please reach out to:
- **Email:** ratemymeal.app@gmail.com
- **Repository:** https://github.com/chanatipjuntip303-cell/RateMyMeal

