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

%! anula(?YakuSuperior, ?YakuInferior) is nondet.
%* Relaciona un yaku con otro que queda anulado cuando el superior también
%* aplica, porque la forma (o situación) del inferior queda estrictamente
%* contenida en la del superior. Las tres primeras cláusulas cubren
%* solapamientos entre yakus normales; la última cubre a cualquier yaku
%* no-yakuman frente a un yakuman, sin necesidad de enumerar cada
%* combinación posible (dora incluida, ver nota arriba).
anula(ryanpeikou, iipeikou). % dos pares de escaleras iguales también son un par de escaleras iguales
anula(chinitsu, honitsu).   % un solo palo puro también satisface "un palo más honores"
anula(junchan, chanta).     % terminal en cada forma también satisface "terminal u honor en cada forma"
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
