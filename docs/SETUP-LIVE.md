# Canlı (testnet) kurulum rehberi

Her adımdan sonra `npm run check:live` çalıştırın. Neyin eksik olduğunu gösterir, gizli anahtarları yazdırmaz. Gerçek değerleri `.env` dosyasına yazın (`.env.example` dosyasının üzerine yazmayın). Anahtarları sohbete yapıştırmayın; sadece **adresleri** paylaşın.

## 1. Cüzdanları hazırlayın

Üç ayrı hesap gerekir. Hepsi testnet içindir, gerçek para taşımayın.

| Rol            | Ne için                                | Nasıl                                                                                              |
| -------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Organizatör    | Kontratı dağıtır, ödül havuzunu fonlar | Uygulamada passkey ile hesap açın (Mera). Adresi "Funds & rewards" ekranında görünür.              |
| Jüri (en az 3) | Oy verir                               | Üç ayrı passkey hesabı. Adreslerini `JURY_ADDRESSES` içine virgülle yazın.                         |
| Ajan (AI)      | SiloRail'e çağrı başına ödeme yapar    | `AGENT_PRIVATE_KEY`. Bu anahtar sunucuda durur; sadece test parası olan yeni bir anahtar kullanın. |

Treasury adresi kesilen teminatın gideceği yerdir (`TREASURY_ADDRESS`). Ayrı bir testnet adresi olabilir.

Yeni bir ajan anahtarı üretmek için:

```powershell
node -e "const {generatePrivateKey,privateKeyToAccount}=require('viem/accounts');const k=generatePrivateKey();console.log(k, privateKeyToAccount(k).address)"
```

## 2. Testnet MON alın

Organizatör, jüri ve her katılımcı hesabında gas gerekir. Katılım için 1.000 MON teminat + 100 MON devam depozitosu (toplam 1.100 MON), ödül havuzu 10.000 MON'dur. Faucet limitleri bunu karşılamayabilir; bu yüzden ilk denemede `contracts/HackathonEscrow.sol` içindeki tutarları küçültmeyi düşünün ya da faucet'in verdiği miktarı sorun.

1. Monad testnet faucet sayfasını açın (Monad resmi dokümanındaki "Faucets" bölümünden bulun).
2. Organizatör adresini yapıştırıp MON isteyin.
3. Kontrol: `npm run check:live` deployer bakiyesini gösterir (`DEPLOYER_PRIVATE_KEY` doluysa).

## 3. AI: SiloRail

1. `.env` içine `AGENT_PRIVATE_KEY=0x...` yazın.
2. `SILORAIL_MODEL` varsayılan olarak `:free` modeldir ve ücretsizdir. Ücretli model istiyorsanız ajan adresine testnet USDC (`0x534b2f3A21130d7a60830c2Df862319e593943A3`) gönderin.
3. Kontrol: `npm run check:live` ajan adresini ve USDC bakiyesini gösterir.

## 4. GitHub token

1. https://github.com/settings/personal-access-tokens adresinde **Fine-grained token** oluşturun.
2. Repository access: sadece proje reposu. Permissions: **Contents: Read and write**.
3. `.env` içine `GITHUB_TOKEN=github_pat_...` yazın.
4. Kontrol: `npm run check:live -- https://github.com/KULLANICI/REPO` (token'ın push edebildiğini doğrular).

Bu token AI commit'leri ve "Anchor the log" özelliği için gerekir.

## 5. x402 (katılımcı başına ödemeli AI çağrısı)

Bu kısım en belirsiz olanıdır: Monad testnet'i destekleyen, `exact` şemasını sunan bir **facilitator** ve EIP-3009 (`transferWithAuthorization`) destekli bir ERC-20 token gerekir.

1. Facilitator adresini bulun (x402 / Monad dokümanları veya kendi barındırdığınız facilitator). `.env` içine `X402_FACILITATOR_URL` olarak yazın.
2. Token: SiloRail'in kullandığı testnet USDC (`0x534b2f3A21130d7a60830c2Df862319e593943A3`) EIP-3009 destekliyorsa `X402_ASSET` olarak onu kullanabilirsiniz.
3. `X402_TOKEN_NAME` ve `X402_TOKEN_VERSION` tokenın EIP-712 alan adı ve sürümüdür. `npm run check:live` zincirden okuyup doğru değeri söyler.
4. `X402_PAY_TO`, ödemeleri alacak adrestir.
5. Kontrol: `npm run check:live`, facilitator'ın `/supported` yanıtında `exact` şemasını ve ağı arar.

Facilitator bulunamazsa uygulama canlı modda başlamaz. Bu durumda demo modunda gösterim yapabilirsiniz.

## 6. Kontratı dağıtın

1. `.env`: `APP_MODE=live`, `JURY_ADDRESSES`, `TREASURY_ADDRESS`, `EVENT_START_ISO` (isteğe bağlı) doldurun.
2. `npm run contracts:compile`
3. `npm run dev`, organizatör passkey'i ile giriş yapın, **Funds & rewards** ekranından dağıtın.
4. Çıkan adresi `ESCROW_ADDRESS` olarak `.env` içine yazın, sunucuyu yeniden başlatın.
5. Aynı ekrandan ödül havuzunu fonlayın.

Alternatif olarak komut satırından: `.env` içine `DEPLOYER_PRIVATE_KEY` yazıp `npm run contracts:deploy`.

## 7. Uçtan uca deneme

1. Katılımcı hesabı ile giriş, proje kaydı (repo + baseline SHA), 1.100 MON (teminat + depozito) ile katılım, organizatör ile check-in.
2. Asistana bir istek gönderin; x402 ödemesi geçmeli.
3. "Apply to GitHub" ile bir commit atın.
4. Project sayfasında "Anchor current log to GitHub" ile çapa atın; repoda `.buildproof/chain-head.json` oluşmalı.
5. Jüri hesabı ile giriş yapıp kanıt paketini indirin.

Sorun çıkarsa çıktıdaki hata metnini (anahtarlar olmadan) paylaşın.

## 8. Demo videosu

2-3 dakikalık bir ekran kaydı yeterlidir (Loom, OBS). Öneri akış:

1. (15 sn) Sorun: jüri sadece son demoyu görüyor.
2. (30 sn) Passkey ile giriş, proje ve baseline SHA kaydı.
3. (45 sn) Asistana istek, GitHub'a commit, log satırı.
4. (30 sn) "Anchor the log" ve repoda çapa dosyası.
5. (30 sn) Jüri görünümü: bütünlük kontrolü, zaman çizelgesi işaretleri, kanıt paketi.
6. (15 sn) Escrow ve itiraz akışı.

Videoyu yükleyip linki README'deki `DEMO VIDEO` satırına yapıştırın.
