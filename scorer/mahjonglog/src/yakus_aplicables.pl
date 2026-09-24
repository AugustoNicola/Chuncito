:- ensure_loaded(yakus).

%* ===================== Compatibilidad entre Yakus =====================
%* yaku/3 (ver yakus.pl) relaciona TODOS los yakus que estructuralmente
%* aplican a una Victoria bajo una Situacion, sin concernirse por sus
%* solapamientos: p. ej. una mano con ryanpeikou también cumple la
%* condición de iipeikou, y una mano yakuman también suele cumplir la
%* condición de varios yakus menores. Este archivo filtra esa lista a los
%* yakus que efectivamente cuentan para la puntuación.
%*
%* Nota sobre kazoeYakuman (yakuman contado, mano de 13+ han): NO se
%* modela acá como yakuman/1 ni en yakus.pl como yaku/3. A diferencia de
%* los demás yakuman, no es una forma particular de mano ni un dato
%* situacional, sino un nivel de puntuación que se alcanza sumando el han
%* de los yakus normales ya aplicables (análogo a mangan, haneman, baiman
%* y sanbaiman). Si lo modeláramos acá como yakuman/1, anularía
%* justamente a los yakus que explican por qué la mano llega a 13+ han,
%* que es lo que la pantalla de puntuación necesita mostrar. Se calculará
%* más adelante, en la capa de puntuación, a partir de la suma de han de
%* YakusFinales.
%*
%* Nota sobre dora: tampoco se modela acá, ya que no es un yaku (no
%* depende de la forma de la mano ni habilita por sí sola una victoria,
%* solo suma han). Cuando exista la capa de puntuación, ahí deberá
%* omitirse el conteo de dora si YakusFinales contiene algún yakuman (ver
%* yakuman/1): por indicación explícita, un yakuman anula tanto a los
%* demás yakus como a la dora.

%! yakuman(?Yaku) is nondet.
%* Yakus de nivel yakuman: anulan a cualquier yaku que no sea yakuman (ver
%* la última cláusula de anula/2). No incluye kazoeYakuman (ver nota
%* arriba). renhou se incluye como yakuman siguiendo la convención más
%* común, aunque algunos reglamentos lo tratan como un yaku grande normal;
%* ajustar acá si hace falta.
yakuman(kokushiMusou).
yakuman(suuAnkou).
yakuman(daisangen).
yakuman(shousuushii).
yakuman(daisuushii).
yakuman(tsuuiisou).
yakuman(chinroutou).
yakuman(ryuuiisou).
yakuman(chuurenPoutou).
yakuman(suuKantsu).
yakuman(tenhou).
yakuman(chiihou).
yakuman(renhou).
% solo existe bajo la regla riichiAbiertoRonYakuman (ver yakuDeRegla/4 en
% yakus.pl): el riichi abierto ganado por ron.
yakuman(riichiAbiertoRon).
% dobles yakuman (ver yakumanDoble/1):
yakuman(kokushiMusouJuusanmen).
yakuman(suuAnkouTanki).
yakuman(junseiChuurenPoutou).

%! yakumanDoble(?Yaku) is nondet.
%* Yakuman que valen por dos (26 han en vez de 13), según la convención
%* más difundida (Mahjong Soul, riichi.wiki). Tres de ellos son la versión
%* "de espera perfecta" de un yakuman simple, que reemplazan (ver anula/2):
%* kokushiMusouJuusanmen (espera de trece lados), suuAnkouTanki (espera
%* tanki) y junseiChuurenPoutou (espera de nueve lados). daisuushii no
%* tiene versión simple: vale doble siempre. Como cualquier otro yakuman,
%* se suman entre sí y con los demás yakuman (p. ej. daisuushii +
%* tsuuiisou = triple yakuman). Ajustar acá si el reglamento de la mesa
%* los cuenta como yakuman simples.
yakumanDoble(daisuushii).
yakumanDoble(kokushiMusouJuusanmen).
yakumanDoble(suuAnkouTanki).
yakumanDoble(junseiChuurenPoutou).

%! multiplicadorYakuman(+Yaku, -Multiplicador) is semidet.
%* Cuántos yakuman vale Yaku: 2 si es yakumanDoble/1, 1 si es cualquier
%* otro yakuman/1. Falla si Yaku no es yakuman.
multiplicadorYakuman(Yaku, 2) :- yakumanDoble(Yaku), !.
multiplicadorYakuman(Yaku, 1) :- yakuman(Yaku).

%! anula(?YakuSuperior, ?YakuInferior) is nondet.
%* Relaciona un yaku con otro que queda anulado cuando el superior también
%* aplica, porque la forma (o situación) del inferior queda estrictamente
%* contenida en la del superior. Las tres primeras cláusulas cubren
%* solapamientos entre yakus normales; la última cubre a cualquier yaku
%* no-yakuman frente a un yakuman, sin necesidad de enumerar cada
%* combinación posible (dora incluida, ver nota arriba). Entre yakuman
%* solo se anulan los que se declaran explícitamente (la versión doble
%* frente a la simple); el resto se suman.
anula(ryanpeikou, iipeikou). % dos pares de escaleras iguales también son un par de escaleras iguales
anula(chinitsu, honitsu).   % un solo palo puro también satisface "un palo más honores"
anula(junchan, chanta).     % terminal en cada forma también satisface "terminal u honor en cada forma"
% la versión doble de un yakuman reemplaza a la simple (ver yakumanDoble/1):
anula(kokushiMusouJuusanmen, kokushiMusou).
anula(suuAnkouTanki, suuAnkou).
anula(junseiChuurenPoutou, chuurenPoutou).
anula(Yakuman, Yaku) :- yakuman(Yakuman), \+ yakuman(Yaku), Yaku \== Yakuman.

%! yakusAplicables(+Victoria, +Situacion, -YakusFinales) is det.
%* yakusAplicables/4 sin reglas de la casa.
yakusAplicables(Victoria, Situacion, YakusFinales) :-
    yakusAplicables(Victoria, Situacion, [], YakusFinales).

%! yakusAplicables(+Victoria, +Situacion, +Reglas, -YakusFinales) is det.
%* Relaciona una Victoria y una Situacion, bajo las reglas de la casa
%* Reglas (ver reglas.pl), con la lista de yakus que efectivamente cuentan
%* para la puntuación: los que aplican estructuralmente (yaku/3, ver
%* yakus.pl) más los que agrega alguna de las Reglas (yakuDeRegla/4, ídem),
%* menos los que quedan anulados por otro yaku más valioso que también
%* aplica (ver anula/2).
yakusAplicables(Victoria, Situacion, Reglas, YakusFinales) :-
    findall(Yaku,
        ( yaku(Yaku, Victoria, Situacion)
        ; member(Regla, Reglas), yakuDeRegla(Regla, Yaku, Victoria, Situacion)
        ),
        Todos),
    list_to_set(Todos, TodosUnicos),
    exclude([Yaku]>>(member(Superior, TodosUnicos), anula(Superior, Yaku)), TodosUnicos, YakusFinales).
