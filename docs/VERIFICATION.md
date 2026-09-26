# Doğrulama kaydı

26 Eylül 2026 — BuildProof / Mera sürümü.

- TypeScript: istemci ve sunucu tip kontrolleri geçti.
- Mera: 3 test; gerçek secp256k1 imza doğrulama, PRF belleğinin sıfırlanması, başarı/hata sonrası imzalama oturumunun kapatılması, aynı PRF'den aynı adres. WebAuthn cihaz töreni mock'tur.
- Solidity: EthereumJS VM üzerinde 87 çağrı/doğrulama; tam fonlama, yanlış stake, tekrar katılım, jüri katılım yasağı, erken çekim, kayıt son tarihi, jüri yetkisi, itiraz, erken/tekrar oy, çoğunluk, azınlık, uygunsuz kazanan, eksik tahsis, tekrar çekim, açık dosya, son iade tarihi ve iptal. Katılım depozitosu: kontenjan, bekleme listesine düşme, kayıt geri çekme ve tam iade, sıradakinin otomatik terfisi (geri çekilmiş kayıt atlanır), koltuk alamayanın başlangıçta tam iadesi, yetkisiz/erken/geç/tekrar yoklama reddi, yoklamada depozito iadesi, gelmeyenin depozitosunun hazineye aktarılması (tekrarı engelli), gelmeyene ödül verilememesi ve yoklama hiç yapılmazsa son tarihte depozito iadesi.
- API: geçici bellekte veritabanı ve bağımsız sunucu; gerçek cüzdan imzasıyla giriş, nonce replay reddi, oturum iptali, proje başlangıç kaydı kilidi, katılım önkoşulu, prompt doğrulama, hash zinciri, kullanıcı izolasyonu, rapor/itiraz ve origin kontrolü.
- Sunucu birim testleri: github.ts (yol güvenliği, dosya bloğu ayrıştırma, commit akışı, hata eşleme), opensource.ts (kredi hesabı, herkese açık repo kontrolü), silorail.ts (maliyet tavanı, ağ kontrolü, hata yönetimi; x402 istemcisi mock) ve zincir çapası içeriği. Gerçek GitHub/SiloRail çağrısı yapılmaz.
- Zincir çapası (`POST /api/chain/anchor`) tip kontrolünden geçti; gerçek GitHub token'ı ile uçtan uca denenmedi.
- Tarayıcı: demo hesabı, proje kaydı, demo katılımı, prompt ve kayıt oluşumu kontrol edildi.
- Canlı passkey cihaz uyumluluğu, gerçek SiloRail LLM çağrısı ve ödemesi, facilitator settlement ve Monad dağıtımı bu ortamda otomatik doğrulanmadı. Gerçek anahtar/adres/fonlarla kabul testi gereklidir.

Demo etiketi ve canlı yapılandırma gereklilikleri arayüzde/README'de belirtilir. Sözleşme testleri bağımsız güvenlik denetiminin yerini tutmaz.
