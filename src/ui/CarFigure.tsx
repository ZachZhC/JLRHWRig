import carImage from "../assets/range_rover_top.png";

export function CarFigure() {
  return (
    <div className="car-figure" aria-hidden="true">
      <img src={carImage} alt="Range Rover" />
      <span className="car-caption">RANGE ROVER</span>
    </div>
  );
}
