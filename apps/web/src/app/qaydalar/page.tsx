/**
 * Qaydalar və məxfilik — /qaydalar
 *
 * NİYƏ AÇILAN PƏNCƏRƏ DEYİL: saytа girən hər kəsə "qəbul edirəm" pəncərəsi
 * göstərmək həm heç kimin oxumadığı bir maneədir, həm də hüquqi baxımdan ən
 * zəif formadır — istifadəçi heç nə etməmişkən nəyəsə razı salınır. Güclü
 * olan, razılığın TAM ÖHDƏLİK ANINDA istənməsidir: nömrə elanda yayımlanmadan
 * əvvəl (elan formundakı işarə qutusu) və hesab açılarkən (giriş pəncərəsi).
 * Bu səhifə isə hər zaman altbardan əlçatandır.
 *
 * HÜQUQİ QEYD: bu mətn vəkil tərəfindən hazırlanmayıb. Azərbaycan Respublikasının
 * "Şəxsi məlumatlar haqqında" Qanunu operator qeydiyyatı və məlumat sahibinin
 * hüquqları üzrə konkret öhdəliklər qoyur; sayt real yüklə işləməyə başlamazdan
 * əvvəl mətn yerli hüquqşünasa göstərilməlidir.
 */

import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import { SupportLine } from "@/components/SupportCorner";

export const metadata = {
  title: "Qaydalar və məxfilik · Pribor",
  description:
    "Pribor saytından istifadə şərtləri, elan verənlərin əlaqə məlumatlarının " +
    "necə yayımlandığı və şəxsi məlumatların qorunması.",
};

/** Bölmə başlığı + gövdə — mətn boyu eyni ritm. */
function S({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="legal-s">
      <h2>
        <span className="legal-n">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function QaydalarPage() {
  return (
    <div className="shell legal">
      <header className="legal-head">
        <Link href="/" className="legal-back">← Ana səhifə</Link>
        <BrandLogo size={30} />
        <h1>Qaydalar və məxfilik</h1>
        <p className="legal-sub">
          Bu səhifə saytdan istifadə şərtlərini və şəxsi məlumatlarınızla nə
          etdiyimizi izah edir. Sadə dildə yazılmışdır; nəyisə gizlətmək üçün
          uzadılmayıb.
        </p>
        <p className="legal-date">Son yenilənmə: 7 avqust 2026</p>
      </header>

      {/*
        Ən çox soruşulan sual mətnin sonunda deyil, ƏN BAŞINDA cavablanır:
        "nömrəm kimə görünür?". Onu 6-cı bəndə gömmək, cavabı verməmək demək
        olardı.
      */}
      <div className="legal-box">
        <h2>Ən qısa cavab: nömrəniz elanda açıqdır</h2>
        <p>
          Elan yerləşdirəndə yazdığınız <b>ad və nömrə elanın bir hissəsidir</b> və
          elanı açan hər kəs — hesabı olmayanlar da — “Nömrəni göstər” düyməsi ilə
          onları görə bilər. Bu qəsdəndir: alıcı sizinlə əlaqə saxlaya bilməsə
          elanın mənası qalmır.
        </p>
        <p>
          Nömrəni topluca yığmağı çətinləşdirmək üçün nömrə səhifənin mənbəyində
          hazır yazılmır, ayrıca sorğu ilə gəlir və o sorğu bir IP üçün dəqiqədə
          10 ilə məhdudlaşdırılıb. <b>Bu, nömrənin gizli olduğu anlamına gəlmir</b> —
          yalnız avtomatik yığımı yavaşladır. Nömrənizin açıq olmasını
          istəmirsinizsə elan yerləşdirməyin.
        </p>
      </div>

      <S n="1" title="Xidmət nədir">
        <p>
          Pribor iki şey təklif edir: Bakı əmlak bazarı üzrə <b>qiymət təxmini</b> və
          istifadəçilərin öz <b>elanlarını</b> yerləşdirdiyi bir lövhə.
        </p>
        <p>
          Qiymətləndirmə statistik bir modelin təxminidir — <b>rəsmi ekspertiza,
          qiymətləndirmə hesabatı və ya maliyyə məsləhəti deyil</b>. Bank, notarius
          və ya məhkəmə üçün istifadə edilə bilməz. Model açıq elan qiymətlərindən
          öyrənir; elan qiyməti isə <b>istənilən</b> qiymətdir, satılan qiymət deyil.
          Aralarındakı fərq bazarlıq payıdır və rayondan rayona dəyişir.
        </p>
      </S>

      <S n="2" title="Hesab və giriş">
        <p>
          Giriş e-poçt ünvanınıza göndərilən birdəfəlik kodla olur. Şifrə saxlanmır.
          E-poçt ünvanınız yalnız girişiniz, elanlarınızın sizə bağlanması və
          lazım gəldikdə sizinlə əlaqə üçün istifadə olunur; reklam üçün satılmır
          və üçüncü tərəflərə verilmir.
        </p>
        <p>
          Hesabınızda baş verənlərə görə siz cavabdehsiniz. Kodunuzu başqası ilə
          bölüşməyin.
        </p>
      </S>

      <S n="3" title="Elan yerləşdirmək">
        <p>Elan yerləşdirərkən öhdəsinə götürürsünüz ki:</p>
        <ul>
          <li>məlumatlar (sahə, otaq, rayon, qiymət, foto) <b>doğrudur</b>;</li>
          <li>əmlak üzərində elan vermək <b>hüququnuz var</b> — sahibisiniz və ya
            sahibin icazəsi ilə hərəkət edirsiniz;</li>
          <li>istifadə etdiyiniz fotoların <b>sizə aid olduğunu</b> və ya
            yerləşdirmək icazəniz olduğunu təsdiq edirsiniz;</li>
          <li>eyni əmlak üçün təkrar-təkrar elan yaratmırsınız.</li>
        </ul>
        <p>
          Saxta, yanıldıcı və ya başqasının elanını təkrarlayan elanları
          xəbərdarlıq etmədən silmək hüququmuz var.
        </p>
      </S>

      <S n="4" title="Əlaqə məlumatlarınız — nə yayımlanır">
        <p>
          Elanınızda <b>ad və telefon nömrəniz</b> yayımlanır. E-poçt ünvanınız
          yayımlanmır. Nömrə barədə ətraflı yuxarıdakı qutuda yazılıb.
        </p>
        <p>
          Elanınızı sildikdə əlaqə məlumatları da elanla birlikdə silinir. Elanı
          silmək istəsəniz “Mənim elanlarım” bölməsindən özünüz edə bilərsiniz;
          hesabınızın tamamilə silinməsini istəyirsinizsə aşağıdakı əlaqə
          kanallarından yazın.
        </p>
        <p className="legal-warn">
          Nəyi <b>vəd edə bilmərik</b>: elanınız yayımlandıqdan sonra nömrənizi
          görən birinin onu harasa köçürməsinin qarşısını ala bilmərik. Nömrəniz
          artıq başqasının əlindədirsə, onu bizim tərəfdən silmək o nüsxəni geri
          gətirmir. Bu, bütün elan saytları üçün eyni şəkildə doğrudur.
        </p>
      </S>

      <S n="5" title="Toplu məlumat yığmaq qadağandır">
        <p>
          Saytdakı əlaqə məlumatlarını <b>topluca yığmaq, kopyalamaq, satmaq və ya
          reklam siyahısı qurmaq qadağandır</b>. Buraya avtomatik skriptlər,
          botlar və sürət limitini aşmaq üçün edilən hər cür üsul daxildir.
        </p>
        <p>
          Elanlarda göstərilən nömrələrə <b>istənilməyən reklam mesajı və ya
          zəng</b> etmək də qadağandır. Bu qaydanı pozan hesabları bağlayır,
          lazım gəldikdə IP ünvanlarını bloklayırıq.
        </p>
      </S>

      <S n="6" title="Hansı məlumatları saxlayırıq">
        <ul className="legal-data">
          <li><b>E-poçt ünvanı</b> — giriş üçün. Yayımlanmır.</li>
          <li><b>Ad və telefon</b> — elanda yayımlanır (bax: 4-cü bənd).</li>
          <li><b>Elan məzmunu</b> — əmlak xüsusiyyətləri, qiymət, foto, açıqlama.</li>
          <li><b>Qiymətləndirmə sorğuları</b> — daxil etdiyiniz xüsusiyyətlər və
            çıxan nəticə. Modelin nə vaxt yanıldığını görmək üçün saxlanır.</li>
          <li><b>Texniki qeydlər</b> — sürət limitinin işləməsi üçün IP ünvanı
            qısa müddət yaddaşda saxlanır.</li>
        </ul>
        <p>
          Məlumatlar Avropa İttifaqı ərazisindəki (Frankfurt) verilənlər
          bazasında saxlanılır. Reklam məqsədilə üçüncü tərəflərə satılmır.
        </p>
      </S>

      <S n="7" title="Bazar məlumatı haradandır">
        <p>
          Alətlərdəki rayon və qəsəbə üzrə medyan ₼/m² rəqəmləri açıq elan
          saytlarındakı <b>ictimai qiymət məlumatlarından</b> hesablanmış
          <b> toplu statistikadır</b>. Başqa saytların elanları Pribor-da
          yayımlanmır və biz həmin elanlardan <b>telefon nömrəsi və satıcı
          məlumatı toplamırıq</b> — statistikaya lazım olmayan şəxsi məlumatı
          toplamaq lazımsız məsuliyyətdir.
        </p>
      </S>

      <S n="8" title="Məsuliyyət">
        <p>
          Pribor alıcı ilə satıcı arasında <b>tərəf deyil</b>. Elanların
          doğruluğuna, əmlakın vəziyyətinə, sənədlərinə və ya sövdələşmənin
          nəticəsinə zəmanət vermirik. Beh və ya ödəniş etməzdən əvvəl sənədləri
          yoxlayın.
        </p>
        <p>
          Sayt “olduğu kimi” təqdim olunur. Fasiləsiz işləyəcəyinə zəmanət
          verilmir.
        </p>
      </S>

      <S n="9" title="Dəyişikliklər və əlaqə">
        <p>
          Bu qaydalar zamanla dəyişə bilər; yuxarıdakı tarix son yenilənməni
          göstərir. Məlumatlarınızın silinməsi, düzəldilməsi və ya hər hansı sual
          üçün:
        </p>
        <div className="legal-contact"><SupportLine /></div>
      </S>

      <footer className="note legal-foot">
        <Link href="/">← Ana səhifəyə qayıt</Link>
      </footer>
    </div>
  );
}
