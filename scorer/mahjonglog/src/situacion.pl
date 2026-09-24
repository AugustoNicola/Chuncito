:- ensure_loaded(fichas).

%* ===================== Situación de la partida =====================
%* Modela el estado de juego en el momento de la victoria, independiente
%* de las fichas de la mano (a diferencia de victoria/3, ver victoria.pl).

%! situacion(?VientoRonda, ?VientoJugador, ?Doras, ?UraDoras, ?Flags) is det.
%* VientoRonda, VientoJugador in {este, sur, oeste, norte}.
%* Doras y UraDoras son las listas de fichas que efectivamente son dora
%* (no los indicadores; esa conversión es responsabilidad de quien arma
%* la Situacion, no de este programa).
%* Flags es una lista de atomos que describen eventos de la ronda
%* (riichi, ippatsu, dobleRiichi, riichiAbierto, houtei, haitei, rinshan,
%* chankan, primeraRonda, ...). tenhou/chiihou/renhou NO son flags: son yakus
%* derivados de primeraRonda junto con ModoVictoria y VientoJugador (ver
%* yakus.pl), ya que cuál de los tres aplica depende de esos otros datos.

%! tieneFlag(+Situacion, +Flag) is semidet.
%* Indica si Flag está presente en los flags de Situacion.
tieneFlag(situacion(_, _, _, _, Flags), Flag) :- memberchk(Flag, Flags).

%! flagDeRiichi(?Flag) is nondet.
%* Flags que representan haber declarado riichi, en cualquiera de sus
%* variantes: riichi común, doble riichi (declarado en el primer descarte)
%* o riichi abierto (declarado mostrando la mano). Son mutuamente
%* excluyentes (ver flagsIncompatibles/2): a lo sumo uno está presente.
flagDeRiichi(riichi).
flagDeRiichi(dobleRiichi).
flagDeRiichi(riichiAbierto).

%! conRiichi(+Flags) is semidet.
%* Indica si Flags incluye alguna variante de riichi (ver flagDeRiichi/1).
%* Es la única comprobación de "hay riichi" que debería usarse: todo lo que
%* exige un riichi declarado (ippatsu, ura dora) acepta cualquiera de sus
%* variantes.
conRiichi(Flags) :- flagDeRiichi(Flag), memberchk(Flag, Flags), !.

%* ===================== Validación =====================

%! vientoValido(?Viento) is nondet.
vientoValido(este). vientoValido(sur). vientoValido(oeste). vientoValido(norte).

%! flagSoportado(?Flag) is nondet.
%* Subconjunto inicial de flags reconocidos; se puede ampliar a medida
%* que se implementen más yakus que dependan de la situación.
flagSoportado(riichi).
flagSoportado(dobleRiichi).
% riichi abierto (open riichi): riichi declarado mostrando la mano. Vale
% más que un riichi común (ver yakus.pl y la regla riichiAbiertoRonYakuman
% en reglas.pl).
flagSoportado(riichiAbierto).
flagSoportado(ippatsu).
flagSoportado(houtei).
flagSoportado(haitei).
flagSoportado(rinshan).
flagSoportado(chankan).
% dato situacional que no se puede derivar de la mano: se ganó antes de
% haber descartado/robado por primera vez. Junto con ModoVictoria y
% VientoJugador, determina cuál de tenhou/chiihou/renhou aplica (ver
% yakus.pl); ninguno de esos tres nombres es un flag en sí mismo.
flagSoportado(primeraRonda).

%! flagsIncompatibles(?Flag1, ?Flag2) is nondet.
%* Pares de flags que no pueden darse juntos en una misma situación.
%* No hace falta declarar ambos órdenes: flagsCompatibles/1 los prueba en los dos sentidos.
flagsIncompatibles(riichi, dobleRiichi).      % riichi y doble riichi son excluyentes: es uno u otro
flagsIncompatibles(riichi, riichiAbierto).    % ídem con riichi abierto: se declara una sola variante de riichi
flagsIncompatibles(dobleRiichi, riichiAbierto).
flagsIncompatibles(houtei, haitei).            % houtei (último descarte) y haitei (último robo) son excluyentes
flagsIncompatibles(houtei, rinshan).           % houtei (descarte) y rinshan (robo tras kan) son excluyentes
flagsIncompatibles(chankan, rinshan).          % chankan (robar un kan ajeno) y rinshan (kan propio) son excluyentes
flagsIncompatibles(chankan, haitei).           % chankan es sobre un descarte disfrazado de kan, no un robo propio
flagsIncompatibles(haitei, rinshan).           % la ficha ganadora robada es o la última del muro vivo (haitei) o el reemplazo tras un kan (rinshan), nunca ambas
% primeraRonda implica ganar antes de haber descartado o robado por
% primera vez, por lo que es incompatible con cualquier variante de
% riichi (no se puede declarar riichi sin haber descartado antes) o con
% ippatsu (requiere una vuelta completa tras declarar riichi):
flagsIncompatibles(primeraRonda, riichi).
flagsIncompatibles(primeraRonda, dobleRiichi).
flagsIncompatibles(primeraRonda, riichiAbierto).
flagsIncompatibles(primeraRonda, ippatsu).

%! situacionValida(+Situacion) is semidet.
%* Corrobora que Situacion tenga vientos válidos, que Doras y UraDoras
%* sean listas de fichas válidas (y que UraDoras esté vacía salvo que haya
%* alguna variante de riichi, ver conRiichi/1), que todos sus flags sean
%* reconocidos y que no haya combinaciones de flags incompatibles entre sí
%* (ver flagsIncompatibles/2), ni ippatsu sin riichi.
situacionValida(situacion(VientoRonda, VientoJugador, Doras, UraDoras, Flags)) :-
    vientoValido(VientoRonda),
    vientoValido(VientoJugador),
    maplist(ficha, Doras),
    maplist(ficha, UraDoras),
    once(( UraDoras == [] ; conRiichi(Flags) )),
    forall(member(Flag, Flags), flagSoportado(Flag)),
    \+ (flagsIncompatibles(F1, F2), memberchk(F1, Flags), memberchk(F2, Flags)),
    \+ (memberchk(ippatsu, Flags), \+ conRiichi(Flags)).
