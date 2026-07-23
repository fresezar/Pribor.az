"""Pribor veri toplama düzlemi.

İlkeler:
  1. Ham veri kutsaldır — süzülmeden, immutable JSONL olarak saklanır.
  2. Nazik tarama — alan adı başına hız limiti, robots.txt'e saygı.
  3. Şema-dayanıklılık — kaynak site değişince sessiz çöp değil, alarm.

HUKUKİ NOT: Scraper'ı bir kaynağa yöneltmeden önce o sitenin kullanım
şartlarını ve yerel mevzuatı hukuk görüşüyle birlikte değerlendirin.
Yalnızca kamuya açık veriyi, kaynak siteyi zorlamayacak hızda toplayın.
Uzun vadeli hedef resmi veri ortaklığıdır (bkz. kök README · Riskler).
"""

__version__ = "0.0.1"
