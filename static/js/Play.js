document.addEventListener("DOMContentLoaded", () =>
{
    const Track = document.querySelector("[data-play-track]");
    const NextButton = document.querySelector("[data-play-next]");

    if (!Track || !NextButton)
    {
        return;
    }

    NextButton.addEventListener("click", () =>
    {
        const ScrollAmount = Math.max(Track.clientWidth * 0.78, 320);
        const MaxScrollLeft = Track.scrollWidth - Track.clientWidth;
        const NextScrollLeft = Track.scrollLeft + ScrollAmount;

        Track.scrollTo({
            left: NextScrollLeft >= MaxScrollLeft - 8 ? 0 : NextScrollLeft,
            behavior: "smooth",
        });
    });
});
