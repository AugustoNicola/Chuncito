:- ensure_loaded(fichas).
:- ensure_loaded(forma_mano_ganadora).
:- ensure_loaded(yakus_aplicables).
:- ensure_loaded(puntuacion).

%* ===================== Resultado de Victoria =====================
%* Punto de entrada de todo el pipeline: a partir de una Mano (fichas +
%* llamadas, ver forma_mano_ganadora.pl), la ficha con la que se ganó, el
%* ModoVictoria y la Situacion de la partida, prueba TODAS las formas en
%* que la mano puede descomponerse (manoGanadora/2 es nondet), puntúa cada
%* una y se queda con la de mayor pago (a igual mano y ficha ganadora,
%* distintas descomposiciones pueden dar yakus y puntuaciones distintas;
%* ver forma_mano_ganadora_tests.pl y puntuacion_tests.pl para ejemplos).
%*
%* No se llama a victoriaValida/1 en ningún punto de este módulo: toda
%* Victoria que se arma acá sale de una descomposición de manoGanadora/2,
%* que por construcción ya es válida (ver la nota equivalente en
%* puntuacion.pl).

%! resultadoDeVictoria(+Mano, +FichaGanadora, +ModoVictoria, +Situacion, -Resultado) is semidet.
%* Resultado = resultado(Yakus, Han, Fu, Nivel, Pago):
%*   Yakus es la lista de yakuHan(Nombre, Han) que efectivamente cuentan,
%*     en el orden en que los muestran los clientes de mahjong (ver
%*     ordenYaku/2), más hasta tres entradas al final —yakuHan(dora, _),
%*     yakuHan(akaDora, _), yakuHan(uraDora, _), en ese orden, una por
%*     cada una que aporte al menos 1 han— si no hay yakuman (los yakuman
%*     anulan la dora, incluida aka/ura; ver puntuacion.pl).
%*   Han y Fu son los totales usados para puntuar (Fu queda en 0 si hay
%*     yakuman, igual que en puntuacion/6).
%*   Nivel in {sinNombre, mangan, haneman, baiman, sanbaiman, kazoeYakuman,
%*     yakuman, dobleYakuman, ...} (ver nivelDePuntuacion/3 en puntuacion.pl).
%*   Pago es pago(Total) (ron) o pagoTsumoDealer(PagoCadaUno) o
%*     pagoTsumo(PagoNoDealer, PagoDealer) (tsumo), ver puntosDeVictoria/6.
%* Falla si ninguna descomposición de Mano produce al menos un yaku (una
%* mano sin yaku no puede ganar, sin importar cuántos puntos "tendría").
resultadoDeVictoria(Mano, FichaGanadora, ModoVictoria, Situacion, Resultado) :-
    findall(Total-resultado(Yakus, Han, Fu, Nivel, Pago),
        ( manoGanadora(Mano, Formas),
          Victoria = victoria(Formas, FichaGanadora, ModoVictoria),
          yakusAplicables(Victoria, Situacion, YakusFinales),
          YakusFinales \= [],
          puntuacion(Formas, FichaGanadora, ModoVictoria, YakusFinales, Situacion, puntuacion(Han, Fu, Nivel, Pago)),
          pagoTotal(Pago, Total),
          yakusOrdenados(YakusFinales, Formas, Situacion, Yakus)
        ),
        Candidatos),
    Candidatos \= [],
    aggregate_all(max(T), member(T-_, Candidatos), MejorTotal),
    member(MejorTotal-Resultado, Candidatos), !.

%! pagoTotal(+Pago, -Total) is det.
%* Convierte cualquiera de las formas de Pago (ver puntosDeVictoria/6) en
%* un único número comparable: la suma de todo lo que efectivamente se
%* paga en esa jugada. Se usa solo para elegir la mejor descomposición,
%* nunca se muestra tal cual en el Resultado.
pagoTotal(pago(Total), Total).
pagoTotal(pagoTsumoDealer(PagoCadaUno), Total) :- Total is PagoCadaUno * 3.
pagoTotal(pagoTsumo(PagoNoDealer, PagoDealer), Total) :- Total is PagoNoDealer * 2 + PagoDealer.

%* ===================== Orden de Yakus =====================
%! ordenYaku(?Yaku, ?Orden) is nondet.
%* Orden de despliegue de cada yaku, siguiendo la convención habitual de
%* los clientes de mahjong: primero los situacionales/de 1 golpe, luego
%* los yakuhai, luego los de forma de mano de menor a mayor valor, luego
%* honitsu/chinitsu, luego los yakuman, y por último la dora (que no es un
%* yaku, pero se muestra en el mismo lugar). El número en sí no importa,
%* solo el orden relativo.
ordenYaku(menzenTsumo, 10).
ordenYaku(riichi, 11).
ordenYaku(ippatsu, 12).
ordenYaku(chankan, 13).
ordenYaku(rinshan, 14).
ordenYaku(haitei, 15).
ordenYaku(houtei, 16).
ordenYaku(dobleRiichi, 17).
ordenYaku(pinfu, 20).
ordenYaku(tanyao, 21).
ordenYaku(iipeikou, 22).
ordenYaku(jikazehai, 23).
ordenYaku(bakazehai, 24).
ordenYaku(haku, 25).
ordenYaku(hatsu, 26).
ordenYaku(chun, 27).
ordenYaku(sanshokuDoujun, 30).
ordenYaku(ittsuu, 31).
ordenYaku(chanta, 32).
ordenYaku(toitoi, 33).
ordenYaku(sanAnkou, 34).
ordenYaku(sanKantsu, 35).
ordenYaku(sanshokuDoukou, 36).
ordenYaku(chiitoitsu, 37).
ordenYaku(honroutou, 38).
ordenYaku(shousangen, 39).
ordenYaku(honitsu, 40).
ordenYaku(junchan, 41).
ordenYaku(ryanpeikou, 42).
ordenYaku(chinitsu, 43).
ordenYaku(kokushiMusou, 50).
ordenYaku(suuAnkou, 51).
ordenYaku(daisangen, 52).
ordenYaku(shousuushii, 53).
ordenYaku(daisuushii, 54).
ordenYaku(tsuuiisou, 55).
ordenYaku(chinroutou, 56).
ordenYaku(ryuuiisou, 57).
ordenYaku(chuurenPoutou, 58).
ordenYaku(suuKantsu, 59).
ordenYaku(tenhou, 60).
ordenYaku(chiihou, 61).
ordenYaku(renhou, 62).
ordenYaku(dora, 90).
ordenYaku(akaDora, 91).
ordenYaku(uraDora, 92).

%! yakusOrdenados(+YakusFinales, +Formas, +Situacion, -Yakus) is det.
%* Relaciona YakusFinales con la lista Yakus = [yakuHan(Nombre, Han), ...]
%* ordenada según ordenYaku/2, agregando al final las entradas de dora,
%* aka dora ("red five") y ura dora que correspondan (ver
%* desglosarDoras/5 en puntuacion.pl), en ese orden y solo si aportan al
%* menos 1 han. Si hay yakuman, cada uno vale 13 han "propio" (ver
%* nivelDePuntuacion/3 en puntuacion.pl) y no se agrega ninguna dora (un
%* yakuman las anula a todas).
yakusOrdenados(YakusFinales, Formas, Situacion, Yakus) :-
    ( manoCerrada(Formas) -> ManoCerrada = true ; ManoCerrada = false ),
    findall(Orden-yakuHan(Yaku, Han),
        ( member(Yaku, YakusFinales),
          ordenYaku(Yaku, Orden),
          hanParaMostrar(Yaku, ManoCerrada, Han)
        ),
        Pares),
    ( member(YakumanCualquiera, YakusFinales), yakuman(YakumanCualquiera)
    -> YakusConDora = Pares
    ;  desglosarDoras(Formas, Situacion, HanDora, HanAkaDora, HanUraDora),
       findall(Orden-yakuHan(Nombre, Han),
           ( member(Orden-Nombre-Han, [90-dora-HanDora, 91-akaDora-HanAkaDora, 92-uraDora-HanUraDora]),
             Han > 0
           ),
           EntradasDora),
       append(Pares, EntradasDora, YakusConDora)
    ),
    keysort(YakusConDora, ParesOrdenados),
    pairs_values(ParesOrdenados, Yakus).

%! hanParaMostrar(+Yaku, +ManoCerrada, -Han) is det.
%* Han "propio" de un yaku para mostrar en la lista de yakus: 13 si es
%* yakuman (ver yakuman/1 en yakus_aplicables.pl), su valor de hanYaku/3
%* (ver puntuacion.pl) en caso contrario.
hanParaMostrar(Yaku, _, 13) :- yakuman(Yaku), !.
hanParaMostrar(Yaku, ManoCerrada, Han) :- hanDeYaku(Yaku, ManoCerrada, Han).
