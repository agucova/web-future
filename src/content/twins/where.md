# Where I am

I travel a lot, so this page says which city I am in. It is city level and nothing finer.

The city itself is not in this file. It is published as DNS records on `agucova.dev` and read back on every request, so this static twin would go stale. The live answer is at <https://agucova.dev/api/where>, which returns `{"disclosed": false}` when nothing is published and otherwise:

```json
{
  "disclosed": true,
  "cityId": "berkeley",
  "city": "Berkeley",
  "country": "United States",
  "latitude": 37.86666666666667,
  "longitude": -122.26666666666667,
  "precisionMetres": 20000,
  "since": "2026-08-23",
  "until": "2026-09-06",
  "name": "agucova.dev",
  "loc": "37 52 0.000 N 122 16 0.000 W 0.00m 20000m 20000m 90000000m"
}
```

## Check it yourself

```
dig +short LOC agucova.dev
dig +short TXT agucova.dev
```

The LOC record is the place. Its last three fields are [RFC 1876](https://www.rfc-editor.org/rfc/rfc1876) size, horizontal precision and vertical precision: the first two are the diameter of the city, which says the coordinates are good to city scale and no further, and the third is at its maximum, which says the altitude field means nothing. The coordinates are rounded to whole arcminutes, so the seconds are always zero.

The TXT record is the terms, in the form `v=where1; since=YYYY-MM-DD; until=YYYY-MM-DD`. After the `until` date the page goes quiet on its own, whether or not I remember to clear it.

The coordinates map to a city name through a list in the site's repository, so the label is something you can reproduce rather than something you have to accept.

## When it is wrong

Standing policy: if I want a trip to be private, I may leave this stale or set it to a city I am not in, for as long as I like, without marking it. So treat it as a hint and not as evidence. There is no flag anywhere in the records or the API that tells you which case you are looking at, because such a flag would give away the trips it exists to cover.
