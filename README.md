# BuildProof

Mera passkey hesapları, x402 AI erişimi ve Monad üzerinde ödül/katılım teminatı içeren hackathon MVP'si. Eski ZeroDev/Kernel cüzdan sistemi kaldırılmıştır.

## Hızlı başlangıç

Node.js 24+ gereklidir (yerleşik SQLite kullanılır).

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

http://localhost:5173 adresini açın. Passkey alan adını sabit tutun; localhost ve 127.0.0.1 farklı relying party kimlikleridir. API localhost:3001 üzerinde çalışır. `.env.local` eski projeden kalmış olabilir; eski ZeroDev değişkenleri kullanılmaz. Yeni sunucu ayarları `.env` dosyasındadır. Örnek dosyayı mevcut `.env` üzerine yazmayın.

Varsayılan **demo modu** dış AI çağrısı veya para transferi yapmaz. Demo hesabı → takım/proje → katılım → AI çalışma alanı → jüri raporu akışı çalışır. Demo verileri SQLite'a kaydedilir; yanıt ve raporlar açıkça demo olarak etiketlenir. Demo ortamında jüri ekranı bütün demo oturumlarına açıktır, bu nedenle gerçek hassas veri girmeyin.

## Altyapı

- `@category-labs/mera` **0.2.0**: PRF destekli passkey oluşturma ve kurtarma, geçici secp256k1 imzalama, viem adaptörü. Anahtar sunucuya veya localStorage'a yazılmaz. Her zincir/ödeme işleminde yeniden passkey istenir ve imzalama oturumu kapatılır.
- React / TypeScript / Vite: Türkçe, responsive katılımcı ve jüri ekranları.
- Express / SQLite: tek kullanımlık nonce + cüzdan imzasıyla giriş, süreli oturum, proje kaydı, prompt geçmişi, rapor ve itiraz açıklamaları.
- x402 resmî SDK: ücretli `/api/chat`, facilitator doğrulaması ve settlement; istemcide ağ/token/alıcı/miktar sınırı.
- Anthropic Messages API: sunucuda saklanan API anahtarı, son konuşma bağlamı ve jüri analizi.
- Monad testnet: 10.000 MON ödül havuzu, kişi başına 1.000 MON teminat ve jüri çoğunluğuyla kesinti.

## Gerçek testnet bağlantısı

1. `.env` içinde `APP_MODE=live` yapın. Demo ve live ayrı veritabanları kullanır.
2. `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `APP_ORIGIN` girin.
3. Mera ile organizatör hesabını oluşturun ve testnet gas bakiyesi yükleyin. `JURY_ADDRESSES` ile yetkili jüri adreslerini tanımlayın. En az üç farklı jüri hesabı gerekir.
4. `npm run contracts:compile` çalıştırın. Teminat & ödüller ekranındaki **Etkinlik sözleşmesini oluştur** formundan Mera passkey ile dağıtın. Çıkan adresi sunucunun `ESCROW_ADDRESS` ayarına ekleyip sunucuyu yeniden başlatın. Organizatör bu Mera hesabı olur. Form dağıtımı ödül havuzunu fonlamaz.
5. Aynı Mera hesabıyla **Teminat & ödüller → Sözleşme işlemleri** ekranından havuzu fonlayın. İleri düzey testnet dağıtımı için `scripts/deploy.ts` de bulunur; bu alternatif CLI özel anahtar kullanır ve varsayılan ürün akışı değildir.
6. Katılımcı cüzdanlarını testnet MON ile fonlayın. Kişi başına 1.000 MON ve işlem gas'ı gerekir. Testnet faucet limitleri bu tutarı karşılamayabilir; miktarlar kullanıcı gereksinimine göre sabittir.
7. `X402_FACILITATOR_URL`, `X402_NETWORK`, `X402_ASSET`, `X402_PAY_TO`, `X402_AMOUNT`, `X402_TOKEN_NAME`, `X402_TOKEN_VERSION` girin. Facilitator'ın seçtiğiniz ağ/token ve EIP-3009 akışını desteklediğini doğrulayın. Eksik canlı yapılandırma uygulamayı başlatmaz.

**x402 ödemesi ile MON teminatı farklıdır.** Bu sürümde x402, EIP-3009 uyumlu bir ERC-20 token kullanır; native MON desteği varsayılmaz. Varsayılan ağ örneği testnettir, çalışır facilitator/token adresi uydurulmamıştır. Otomatik sponsor bütçesi dağıtımı yoktur; organizatör katılımcı hesaplarını ayrıca fonlar.

## Sözleşme

`contracts/HackathonEscrow.sol` tek etkinlik içindir:

- Kayıt başlamadan önce 10.000 MON fonlanır; kayıt etkinlik başlangıcında kapanır.
- Katılım teminatı 1.000 MON; organizatör ve jüri katılımcı olamaz.
- Etkinlik sonrası jüri bir kanıt özetiyle dosya açabilir. Katılımcı ilk itiraz penceresinde kanıt özeti sunar.
- Oylar itiraz penceresi sonrasında verilir. İkinci pencere bitince çoğunluk varsa teminat kesilir, yoksa korunur.
- Tüm dosyalar çözülmeden ödüller kesinleşmez. Organizatör havuzun tamamını uygun kazananlara tahsis eder.
- Kesintiler baştan tanımlanan hazine adresine tahsis edilir. Ödül, teminat ve kesinti muhasebesi ayrıdır.
- Ödemeler `claim` ile çekilir. Tekrar çekme ve reentrancy engellenir.
- Başlamadan iptalde iadeler açılır. Kesinleşmemiş etkinlik son tarihe ulaşırsa katılımcılar kalan teminatlarını, organizatör kalan ödül havuzunu alabilir.

Jüri sözleşme işlemleri ve katılımcı itirazı Mera ile arayüzden yapılabilir. Sunucuya özel anahtar verilmez. API'ye gönderilen açıklama **zincir itirazı değildir**; arayüzde zincir itiraz işlemi ayrıca bulunur.

## Kayıtların anlamı

Promptlar ve yanıtlar kullanıcı bazında zaman damgası ve önceki kaydı içeren SHA-256 zinciriyle kaydedilir. Bu veritabanı içindeki değişiklikleri kontrol etmeye yardımcı olur; bağımsız/noterlenmiş veya zincire sabitlenmiş kanıt değildir. Sunucu operatörü bütün geçmişi yeniden yazabilir. GitHub başlangıç SHA'sı kullanıcının beyanıdır; otomatik depo geçmişi doğrulaması henüz yoktur. AI, yalnızca mevcut kayıtları özetler; projenin gerçek başlangıç tarihini veya hileyi kesinleştiremez.

Takım bu MVP'de kayıt alanıdır; davet/üyelik yönetimi ve birden fazla etkinlik kapsam dışındadır. Jüri raporları hesap bazında üretilir. Anahtarlar, parolalar ve hassas kişisel veriler promptlara girilmemelidir.

## Kontroller

```powershell
npm run typecheck
npm test
npm run contracts:test
npm run test:api
npm run build
npm audit
```

EVM testleri gerçek Solidity bytecode'unu yerel EthereumJS VM üzerinde çalıştırır. Gerçek cihaz passkey PRF, gerçek Anthropic, x402 facilitator ve Monad testnet işlemleri için yapılandırılmış hesaplarla kabul testi gerekir. Sözleşme bağımsız güvenlik denetiminden geçmemiştir; bu teslim testnet MVP'sidir.

## Dosyalar

- `src/lib/mera.ts`: passkey ve imzalama
- `src/components/ChainConsole.tsx`: teminat/ödül/jüri zincir işlemleri
- `server/index.ts`: auth, SQLite, AI router, x402, jüri API
- `contracts/HackathonEscrow.sol`: MON escrow
- `docs/PRODUCT.md`: ürün özeti
- `docs/RULES.md`: sözleşmeye hash'i verilen etkinlik kuralları

Kaynaklar: https://github.com/category-labs/mera · https://docs.x402.org/ · https://docs.monad.xyz/

## Yerel önizleme ve eski kaynaklar

`npm run build` sonrası `npm start` ile derlenen uygulama API sunucusundan da sunulur. Bu şekilde localhost:3001 kullanacaksanız `APP_ORIGIN=http://localhost:3001` ayarlayın. Geliştirme önizlemesi için localhost:5173 kullanılır.

Önceki cüzdan dosyaları `archive/previous-wallet` içinde çalıştırılmayan `.txt` arşividir. Aktif kaynaklarda ve bağımlılık bildiriminde ZeroDev/Kernel yoktur; uygulama yalnızca Mera hesap altyapısını kullanır.
